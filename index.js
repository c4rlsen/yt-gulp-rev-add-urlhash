 var gutil = require('gulp-util');
 var through = require('through2');
 var path = require('path');

 module.exports = function(opts){

  'use strict';

  var renames = [];
  var cache = [];

  if (!opts) {
   throw new gutil.PluginError("gulp-rev-add-urlhash", "No parameters supplied");
  }
  if (!opts.filetypes || (!opts.filetypes instanceof Array)){
   throw new gutil.PluginError("gulp-rev-add-urlhash", "Missing parameter : filetypes");
  }

  if (!opts.canonicalUris) {
    opts.canonicalUris = true;
  }

  opts.prefix = opts.prefix || '';
  opts.suffix = opts.suffix || '';

  opts.replaceInExtensions = opts.replaceInExtensions || ['.js', '.css', '.html', '.hbs'];

  var filetypes = new RegExp('.' + opts.filetypes.join('|.'));

  // template to match each processed line. <link>-tag and href
  var attrsAndProps = [
    { exp : /(<\s*)(.*?)\bhref\s*=\s*((["{0,1}|'{0,1}]).*?\4)(.*?)>/gi,
      captureGroup : 3,
      templateCheck : /(<\s*){0,1}(\blink)(.*?)\brel=["']import["'](.*?)\bhref\s*=\s*/
    }
  ];

  function fmtPath(base, filePath) {
    var newPath = path.relative(base, filePath);

    return canonicalizeUri(newPath);
  }

  function canonicalizeUri(filePath) {
    if (path.sep !== '/' && opts.canonicalUris) {
      filePath = filePath.split(path.sep).join('/');
    }

    return filePath;
  }

  function ignoreUrl(match){
    var regEx = /((\bhttp|\bhttps):){0,1}\/\//;
    if(regEx.test(match)){
      if((rootRegEx !== null) && (!rootRegEx.test(match))){
        return true;
      }
    }
    return false;
  }
  /**
  * Check line before processing:
  * - line must match regEx.templateCheck
  * - href in line must match filetype
  *
  */
  function replacementCheck(cGroup, match, regEx){
    if(!opts.templates){
      return filetypes.test(cGroup);
    }
    if(regEx.templateCheck){
      // console.log("\n___", match);
      // console.log("matching: filetypes=%s template=%s",filetypes.test(cGroup),regEx.templateCheck.test(match) );
      return filetypes.test(cGroup) && regEx.templateCheck.test(match);
    } else {
      return filetypes.test(cGroup);
    }
  }

  // From `gulp-rev-urlhash` to have comparable urls in function `getRevHash()`.
  function relPath(filePath, base) {
    // console.log('filePath:', filePath);
    // console.log('base:', base);
    // var p = "../../polymer/polymer.html";
    // var z = path.
    // console.log('base:', base)
    var newPath;

    if (filePath.indexOf(base) !== 0) {

      newPath = filePath.replace(/\\/g, '/');

    } else {

      newPath = filePath.substr(base.length).replace(/\\/g, '/');
      if (newPath[0] === '/') {
        newPath = newPath.substr(1);
      }

    }

    // console.log('mewPath:', newPath, "\n_____________\n")
    return newPath;
  }
  /**
  * Look-up the given path in the revision-manifest to get the matching url-hash.
  * Return only the url-hash, to leave the path as is and only add the url-hash.
  *
  * @param {String} - path without leading forward-slash relative to the base
  * @return {String} - url-hash e.g. ?v=34elsfls
  */
  function getRevHash(fullRelPath) {
    // console.log("\n\nstart...")

    for (var i = 0; i < renames.length; i++) {
      var rename = renames[i];
      var unreved = opts.modifyUnreved ? opts.modifyUnreved(rename.unreved) : rename.unreved;
      var reved = opts.modifyReved ? opts.modifyReved(rename.reved) : rename.reved;
      var revedOri = rename.revedOri;

      if (revedOri.indexOf(fullRelPath) > -1) {
        // for debugging in network-waterfall, add element after hash and compare with url
        // var element = revedOri.substring( revedOri.lastIndexOf('/') + 1, revedOri.lastIndexOf('.') );

        // console.log("\n---\n◊ Revision found: ","color: green;", "color: inherit;", revedOri, fullRelPath, "\n---\n");
        return revedOri.substring(revedOri.indexOf('?v='));
      }

    }

    // no revision found:
    console.log("\n-------\nNo Revision found:\n\trevedOri=%s ?== fullRelPath=%s", revedOri, fullRelPath, "\n----------\n");
    // console.log("revedOri.indexOf(fullRelPath):", revedOri.indexOf(fullRelPath), "\n-----\n");

    return null;
  }
  /**
  * Process each line, which matches the template-regex and href-regex
  * (from: `attrsAndProps`) to get the url, omit all others.
  * Look-up the matching url-hash for caching purposes and add it to the
  * url.
  */
  function processLine(line, regEx, file){

    line = line.replace(regEx.exp, function(match){
      var cGroup = arguments[regEx.captureGroup];
      // console.log("\ncGroup, match: ",cGroup, match);
      if(replacementCheck(cGroup, match, regEx)){
        if(!ignoreUrl(cGroup)){

          var cGroupClean = cGroup.replace(/['"]+/g, '');
          // create full path from relative paths in <link> elements to compare them to rev-manifest
          var cGCFullPath = path.resolve(path.dirname(file.path), cGroupClean);
          var cGCFullRelPath = relPath( cGCFullPath, file.base);

          cGCFullRelPath = cGCFullRelPath.replace(/^\/+/g, '');
          var revHash = getRevHash(cGCFullRelPath);

          if (!!revHash) {
            cGroupClean+= revHash;
          }
          var cGroupNew = "\"" + cGroupClean + "\"";

          // console.log("cGroup.was=%s, now=%s", cGroup, cGroupNew, "\n\n");

          return match.replace(cGroup, cGroupNew );
        }
      }
      return match;
    });
    //pass back line if noop
    return line;
  }
  /**
  *
  */
  function collectRevs(file, enc, callback){
    // Do nothing if no contents
    if(file.isNull()) {
      this.push(file);
      return callback();
    }

    if (file.isStream()){
      return this.emit('error', new gutil.PluginError('gulp-assetpaths',  'Streaming not supported'));
    }
    // Collect renames from reved files.
    //## from gulp-rev-replace-relative

    // console.log("\t #### revOrigPath", file.revOrigPath);
    if (file.revOrigPath) {
      renames.push({
        unreved: fmtPath(file.revOrigBase, file.revOrigPath),
        reved: opts.prefix + fmtPath(file.base, file.path)
      });
    }

    if (opts.replaceInExtensions.indexOf(path.extname(file.path)) > -1 && (!opts.ignoreFiles || opts.ignoreFiles.indexOf(path.basename(file.path)) < 0)) {
      // file should be searched for replaces
      cache.push(file);
    // end ###
      // console.log("processing: ", path.basename(file.path));

    //## from gulp-rev-replace-relative
    } else {
      // console.log("\n\t\t-----\nignoring: ", path.basename(file.path),"\n\t\t-----\n");
      // nothing to do with this file
      this.push(file);

    }
    // end ###
    callback();

  }

  function startRev(cb) {
    var stream = this;

    //load manifest-file, than process files
    if (opts.manifest) {
      // Read manifest file for the list of renames.
      opts.manifest.on('data', function(file) {
        var manifest = JSON.parse(file.contents.toString());
        Object.keys(manifest).forEach(function(srcFile) {
          renames.push({
            unreved: canonicalizeUri(srcFile),
            revedOri: (opts.noRev ? canonicalizeUri(srcFile) : canonicalizeUri(manifest[srcFile])),
            reved: opts.prefix + (opts.noRev ? canonicalizeUri(srcFile) : canonicalizeUri(manifest[srcFile])) + opts.suffix
          });
        });
      });
      opts.manifest.on('end', processCachedFiles);
    } else {
      processCachedFiles();
    }

    function processCachedFiles() {

      // Once we have a full list of renames, search/replace in the cached
      // files and push them through.
      cache.forEach(function replaceInFile(file) {
        if(file.isBuffer()){
          var outfileContents = '';
          var contents = file.contents.toString('utf8')
          var lineEnding = contents.search(/[\r\n]/) !== -1 ? "\r\n" : "\n";
          var lines = contents.split(lineEnding);
          lines.forEach(function(line){
            attrsAndProps.forEach(function(regEx){
              line = processLine(line, regEx, file);
            }, this);
            outfileContents += line;
          }, this);
          var outfile = file.clone();
          outfile.contents = new Buffer(outfileContents);
        }

        stream.push(outfile);
      });

      cb();
    }
  }

  return through.obj(collectRevs, startRev);

};
