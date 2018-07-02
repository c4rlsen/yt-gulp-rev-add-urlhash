 var gutil = require('gulp-util')
   , through = require('through2')
   , path = require('path')
   , chalk = require('chalk')
   , fancyLog = require('fancy-log');

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

  // template to match each processed line. <link>-tag and href, and <script>-tag and src
  // parentesis in 'exp' define captureGroups to extract the value of href and src later on.
  // the last templte is for all files that are difficult to match. There we add '?v=####CACHE####' to the
  // import to find those dependencies in here and add a caching hash.
  var attrsAndProps = [
    { exp : /(<\s*)(.*?)\bhref\s*=\s*((["{0,1}|'{0,1}]).*?\4)(.*?)>/gi,
      captureGroup : 3,
      templateCheck : /(<\s*){0,1}(\blink)(.*?)\brel=["']import["'](.*?)\bhref\s*=\s*/
    },
    { exp : /((<\s*){0,1}\bscript)(.*?)\bsrc\s*=\s*((["{0,1}|'{0,1}]).*?\5)/gi,
        captureGroup : 4,
        templateCheck : /(<\s*){0,1}(\bscript)(.*?)\bsrc\s*=\s*/
    },
    {
      exp: /(['"]\/.*\..*\?v=####CACHE####['"])/gi,
      captureGroup: 1,
      templateCheck: /['"]\/.*\..*\?v=####CACHE####['"]/
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
      // console.log("matching: filetypes=%s template=%s", filetypes.test(cGroup),regEx.templateCheck.test(match) );
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
  * get url-hash for all dependencies except those in `opts.ignoreMatchingUrls`
  *
  * @param {String} - path without leading forward-slash relative to the base
  * @return {String} - url-hash e.g. ?v=17
  */
  function getRevHash(fullRelPath, urlHash) {
    // console.log("\n\n________________\nfile=%s", fullRelPath);
      for (var i = 0; i < opts.ignoreMatchingUrls.length; i++) {
        var regExp = new RegExp(opts.ignoreMatchingUrls[i]);
         if (!regExp.test(fullRelPath)) {

           fancyLog("\t"+chalk.cyan("Add Hash")+": \""+ chalk.magenta(fullRelPath)+"\"");
          return urlHash;
         } else {

            fancyLog("\tIgnore Match: \"" + chalk.magenta(fullRelPath) + "\" (regexp: "+ opts.ignoreMatchingUrls[i] +")");
          return null;
         }
      }

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

        var cGroupClean = cGroup.replace(/['"]+/g, ''),
            cGroupClean = cGroupClean.replace(/\?v=####CACHE####/g, '');
        // create full path from relative paths in <link> elements to compare them to rev-manifest
        var cGCFullPath = path.resolve(path.dirname(file.path), cGroupClean);
        var cGCFullRelPath = relPath( cGCFullPath, file.base);

        cGCFullRelPath = cGCFullRelPath.replace(/^\/+/g, '');

        var revHash = getRevHash(cGCFullRelPath, "?v="+opts.urlHash);

        if (!!revHash) {
          cGroupClean+= revHash;
        }
        var cGroupNew = "\"" + cGroupClean + "\"";
        // console.log("cGroup.was=%s, now=%s", cGroup, cGroupNew, "\n\n");

        return match.replace(cGroup, cGroupNew );

      }
      return match;
    });
    //pass back line if noop
    return line;
  }
  /**
  * only process file, if it is not in the regex-array
  * `opts.ignoreFiles`
  *
  * @param {Array} - Array of Regex
  * @param {String} - File-Path of acutal file in stream
  */
  function matchesRegExp(ignoreFiles, file) {
    for (var i = 0; i < ignoreFiles.length; i++) {
      var regExp = new RegExp(ignoreFiles[i]);
      if (regExp.test(file)) {
        return true;
      }
    }
    return false;
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
      return this.emit('error', new gutil.PluginError('gulp-rev-add-urlhash',  'Streaming not supported'));
    }
    // Collect renames from reved files.
    //## from gulp-rev-replace-relative

    // console.log("\t #### revOrigPath", file.revOrigPath);
    /*if (file.revOrigPath) {
      renames.push({
        unreved: fmtPath(file.revOrigBase, file.revOrigPath),
        reved: opts.prefix + fmtPath(file.base, file.path)
     });
    }*/

    // console.log("\t\tRegEXp ignore file=%s ? ignore-> %s",file.path,matchesRegExp(opts.ignoreFiles, file.path));
    if (opts.replaceInExtensions.indexOf(path.extname(file.path)) > -1 && (!opts.ignoreFiles || !matchesRegExp(opts.ignoreFiles, file.path) )) { //opts.ignoreFiles.indexOf(path.basename(file.path)) < 0)) {

      // push file for further processing
      cache.push(file);
      fancyLog(chalk.cyan("Processing: ") +"\""+ path.basename(file.path)+"\"");
    } else {

      // nothing to do with this file
      this.push(file);
      fancyLog("Ignoring: \"" + chalk.magenta(path.basename(file.path))+"\"");
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
        console.log("\n");
        fancyLog("---> FILE: \""+chalk.magenta(file.path)+"\"");
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
  fancyLog("-> gulp-rev-add-urlhash: "+ chalk.cyan("PROCESS FILES AND ADD HASHES TO ITS DEPENDENCIES"));

  return through.obj(collectRevs, startRev);

};
