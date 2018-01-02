 var gutil = require('gulp-util');
 var through = require('through2');
 var path = require('path');

 module.exports = function(opts){

  'use strict';
  // var rootRegEx;
  var renames = [];
  var cache = [];

  if (!opts) {
   throw new gutil.PluginError("gulp-assetpaths", "No parameters supplied");
  }
  if (!opts.filetypes || (!opts.filetypes instanceof Array)){
   throw new gutil.PluginError("gulp-assetpaths", "Missing parameter : filetypes");
  }
  // if (typeof(opts.newDomain) !== 'string' && !opts.newDomain){
   // throw new gutil.PluginError("gulp-assetpaths", "Missing parameter : newDomain");
  // }
  // if (!opts.oldDomain){
   // throw new gutil.PluginError("gulp-assetpaths", "Missing parameter : oldDomain");
  // }
  // if(typeof(opts.docRoot) !== 'string' && !opts.docRoot){
   // throw new gutil.PluginError("gulp-assetpaths", "Missing parameter : docRoot");
  // }

  if (!opts.canonicalUris) {
    opts.canonicalUris = true;
  }

  opts.prefix = opts.prefix || '';
  opts.suffix = opts.suffix || '';

  opts.replaceInExtensions = opts.replaceInExtensions || ['.js', '.css', '.html', '.hbs'];

  var filetypes = new RegExp('.' + opts.filetypes.join('|.'));
  // console.log('######## filetypes', filetypes);
  // var rootRegEx = setReplacementDomain(opts.oldDomain);
  var attrsAndProps = [
    { exp : /(<\s*)(.*?)\bhref\s*=\s*((["{0,1}|'{0,1}]).*?\4)(.*?)>/gi,
      captureGroup : 3,
      templateCheck : /(<\s*){0,1}(\blink)(.*?)\brel=["']import["'](.*?)\bhref\s*=\s*/
    }
  ];

  //create custom attributes expressions
  // if(opts.customAttributes){
  //  var customAttrs = opts.customAttributes.map(function(attr){
  //    return {
  //      exp: new RegExp("\\b" + attr + "\\s*=\\s*(([\"{0,1}|'{0,1}]).*\\2)", "gi"),
  //      captureGroup: 1,
  //      templateCheck: /.*/
  //    }
  //  });
  //  attrsAndProps = attrsAndProps.concat(customAttrs);
  // }

  // function setReplacementDomain(string){
 //     if(isRelative(opts.oldDomain)){
  //    return new RegExp('(((\\bhttp\|\\bhttps):){0,1}\\/\\/' + string + ')');
  //  } else {
  //    return new RegExp(string);
  //  }

  // }

  // function isRelative(string, insertIndex){
  //  return (string.indexOf('/') === -1 || string.indexOf('/') > insertIndex);
  // }

  // function getInsertIndex(string){
  //  if(string.search(/^.{0,1}\s*("|')/) !== -1){
  //    //check to see if template not using interpolated strings
  //    var nonInter = /["|']\s*[+|.][^.]/.exec(string);
  //    if(nonInter){
  //      return string.search(/"|'/) === nonInter.index ? nonInter.index : (nonInter.index-1)
  //    }
  //    return (string.search(/"|'/)+1);
  //  }
  //  return 1;
  // }

  // function insertAtIndex(string, fragment, index){
  //  return [string.slice(0, index), fragment, string.slice(index)].join("");
  // }

  function ignoreUrl(match){
    var regEx = /((\bhttp|\bhttps):){0,1}\/\//;
    if(regEx.test(match)){
      if((rootRegEx !== null) && (!rootRegEx.test(match))){
        return true;
      }
    }
    return false;
  }

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

  // get
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

  function getRevHash(fullRelPath) {
    // console.log("\n\nstart...")

    for (var i = 0; i < renames.length; i++) {
      var rename = renames[i];
      var unreved = opts.modifyUnreved ? opts.modifyUnreved(rename.unreved) : rename.unreved;
      var reved = opts.modifyReved ? opts.modifyReved(rename.reved) : rename.reved;
      var revedOri = rename.revedOri;
      // console.log("revedOri=%s ?== %s", revedOri, fullRelPath);
      // console.log("index:", revedOri.indexOf(fullRelPath));
      if (revedOri.indexOf(fullRelPath) > -1) {

        console.log("\n____\n\trevision found: ", revedOri, fullRelPath);

        return revedOri.substring(revedOri.indexOf('?v='));
      }

    }
    return null;
  }

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
          var revHash = getRevHash(cGCFullRelPath);

          if (!!revHash) {
            cGroupClean+= revHash;
          }
          var cGroupNew = "\"" + cGroupClean + "\"";

                console.log("cGroup.was=%s, now=%s", cGroup, cGroupNew, "\n\n");

          return match.replace(cGroup, cGroupNew );
        }
      }
      return match;
    });
    //pass back line if noop
    return line;
  }

  // function countRelativeDirs(path){
  //  var relDirs = path.filter(function(dir){
  //    return dir.indexOf('..') !== -1 ? true : false;
  //  });
  //  return relDirs.length;
  // }

  // function anchorToRoot(string, file){
  //  var index = getInsertIndex(string);
  //  if(isRelative(string,index)){
  //    //if the path isn't being dynamically generated(i.e. server or in template)
  //    if(!(/^\s*[\(]{0,1}\s*["|']{0,1}\s*[<|{|.|+][^.]/.test(string))){
  //      if(opts.docRoot){
  //        var currentPath = string.split("/");
  //        var relDirs = countRelativeDirs(currentPath);
  //        string = string.replace(/\.\.\//g,"");
  //        relDirs = relDirs > 0 ? relDirs : relDirs+1;
  //        var fullPath = file.path.split("/").reverse().slice(relDirs);
  //        if(fullPath.indexOf(opts.docRoot) !== -1){
  //          while(fullPath[0] !== opts.docRoot){
  //            string = insertAtIndex(string, fullPath[0] + '/', index);
  //            fullPath = fullPath.slice(1);
  //          }
  //        }
  //      }
  //    }
  //  }
  //  return string;
  // }

  function absolute(base, relative) {
    var stack = base.split("/"),
        parts = relative.split("/");
    // stack.pop(); // remove current file name (or empty string)
                 // (omit if "base" is the current folder without trailing slash)

      // console.log("stack:", stack);
      // console.log("parts:", parts);


    for (var i=0; i<parts.length; i++) {
        if (parts[i] == ".") {
            // console.log("parts[i] continue", parts[i]);
            continue;
        }
        if (parts[i] == "..") {
          // console.log("parts[i] pop");

            stack.pop();
          // console.log("parts[i] after pop", stack);
        }
        else {
          // console.log("parts[i] push");
            stack.push(parts[i]);
          // console.log("parts[i] after push", stack);
        }
    }
    // remove all leading forward-slashes, as this causes multiple forward-slashes in some cases
    return stack.join("/").replace(/^\/+/g, '');
  }

  // function insertPath(string, file){
  //  // console.log("string: ", string, path.basename(file));
  //  var string = anchorToRoot(string, file);
  //  var index = getInsertIndex(string);
  //  if(isRelative(string, index)) {
  //    string = insertAtIndex(string, '/', index);
  //  }
  //  return insertAtIndex(string, "XXXXXX", index);
  // }

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
      console.log("\n\t\t-----\nignoring: ", path.basename(file.path),"\n\t\t-----\n");
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
};
