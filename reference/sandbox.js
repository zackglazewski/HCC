/*  oh, hi there, reader of this file!
    there's lots of spaghetti code in here. that's by design, in a sense. i intend to throw out most of this
    code when i make the flexible templating system. you'll find the small bits that aren't template drawing
    specific or letter-spacing hacking specific have a higher code quality and will be transferred over. the
    rest gets chucked in the 'plan to build it twice because you'll have to' sense. */

    var debug = false;
    String.prototype.toTitleCase = function() {
        return this.replace(/\w\S*/g, function(txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
    }
    ;
    
    //INITIALIZING THE CANVASES
    var bgCanvas = document.getElementById('background-layer');
    bgCanvas.style.color = 'black';
    bgCanvas.width = 1500;
    bgCanvas.height = 1500;
    bgCanvas.style.width = '750px';
    //scale canvas to half size, keeping full resolution. less blurry on hi-dpi screens?
    bgCanvas.style.height = '750px';
    var bgCtx = bgCanvas.getContext('2d');
    
    var textCanvas = document.getElementById('text-layer');
    textCanvas.width = 1500;
    textCanvas.height = 1500;
    textCanvas.style.width = '750px';
    //scale canvas to half size, keeping full resolution. less blurry on hi-dpi screens?
    textCanvas.style.height = '750px';
    var textCtx = textCanvas.getContext('2d');
    addCanvasLetterSpacing(textCtx);


    var imageCanvas = document.getElementById('image-layer');
    imageCanvas.width = 1500;
    imageCanvas.height = 1500;
    imageCanvas.style.width = '750px';
    imageCanvas.style.height = '750px';
    var imgCtx = imageCanvas.getContext('2d');

    var fogCanvas = document.getElementById('fog-layer');
    fogCanvas.width = 1500;
    fogCanvas.height = 1500;
    fogCanvas.style.width = '750px';
    fogCanvas.style.height = '750px';
    var fogCtx = fogCanvas.getContext('2d');

    

    /*var agentImg = "assets/luigi.png";
    var bimg = new Image;
    bimg.onload = function() {
        var aspectRatio = bimg.width / bimg.height;
        var newWidth = 300;
        var newHeight = newWidth / aspectRatio;
        imgCtx.drawImage(bimg, 980 - (newWidth / 2), 550 - (newHeight / 2), newWidth, newHeight);
    }
    bimg.src = agentImg;*/
    
    //load vydar image for now
    var bgImage = "assets/blank.jpg";
    var img = new Image;
    img.onload = function() {
        bgCtx.drawImage(img, 0, 0);
        // Or at whatever offset you like
    }
    ;
    img.src = bgImage;
    
    if (debug) {
        //debug info for preview version
        textCtx.font = "10px 'ScapeCondensedBold'";
        textCtx.textBaseline = "top";
        textCtx.fillText(navigator.userAgent, 5, 10);
    }

    var primaryHueSelector = document.getElementById("primary-hue");
    var primaryHueNumber = document.getElementById("primary-hue-number");
    primaryHueSelector.addEventListener('input', (e) => {
        primaryHueNumber.value = e.target.value;
    });
    primaryHueNumber.addEventListener('input', (e) => {
        primaryHueSelector.value = e.target.value;
    });

    var primarySatSelector = document.getElementById("primary-sat");
    var primarySatNumber = document.getElementById("primary-sat-number");
    primarySatSelector.addEventListener('input', (e) => {
        primarySatNumber.value = e.target.value;
    });
    primarySatNumber.addEventListener('input', (e) => {
        primarySatSelector.value = e.target.value;
    });

    var primaryValSelector = document.getElementById("primary-val");
    var primaryValNumber = document.getElementById("primary-val-number");
    primaryValSelector.addEventListener('input', (e) => {
        primaryValNumber.value = e.target.value;
    });
    primaryValNumber.addEventListener('input', (e) => {
        primaryValSelector.value = e.target.value;
    });

    var secondaryHueSelector = document.getElementById("secondary-hue");
    var secondaryHueNumber = document.getElementById("secondary-hue-number");
    secondaryHueSelector.addEventListener('input', (e) => {
        secondaryHueNumber.value = e.target.value;
    });
    secondaryHueNumber.addEventListener('input', (e) => {
        secondaryHueSelector.value = e.target.value;
    });

    var secondarySatSelector = document.getElementById("secondary-sat");
    var secondarySatNumber = document.getElementById("secondary-sat-number");
    secondarySatSelector.addEventListener('input', (e) => {
        secondarySatNumber.value = e.target.value;
    });
    secondarySatNumber.addEventListener('input', (e) => {
        secondarySatSelector.value = e.target.value;
    });

    var secondaryValSelector = document.getElementById("secondary-val");
    var secondaryValNumber = document.getElementById("secondary-val-number");
    secondaryValSelector.addEventListener('input', (e) => {
        secondaryValNumber.value = e.target.value;
    });
    secondaryValNumber.addEventListener('input', (e) => {
        secondaryValSelector.value = e.target.value;
    });

    var backgroundHueSelector = document.getElementById("background-hue");
    var backgroundHueNumber = document.getElementById("background-hue-number");
    backgroundHueSelector.addEventListener('input', (e) => {
        backgroundHueNumber.value = e.target.value;
    });
    backgroundHueNumber.addEventListener('input', (e) => {
        backgroundHueSelector.value = e.target.value;
    });

    var backgroundSatSelector = document.getElementById("background-sat");
    var backgroundSatNumber = document.getElementById("background-sat-number");
    backgroundSatSelector.addEventListener('input', (e) => {
        backgroundSatNumber.value = e.target.value;
    });
    backgroundSatNumber.addEventListener('input', (e) => {
        backgroundSatSelector.value = e.target.value;
    });

    var backgroundValSelector = document.getElementById("background-val");
    var backgroundValNumber = document.getElementById("background-val-number");
    backgroundValSelector.addEventListener('input', (e) => {
        backgroundValNumber.value = e.target.value;
    });
    backgroundValNumber.addEventListener('input', (e) => {
        backgroundValSelector.value = e.target.value;
    });

    function saveJSON(jsonString, filename) {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function saveTheme() {
        var json_dict = {}
        json_dict["primary_hue"] = primaryHueNumber.value;
        json_dict["primary_sat"] = primarySatNumber.value;
        json_dict["primary_val"] = primaryValNumber.value;

        json_dict["secondary_hue"] = secondaryHueNumber.value;
        json_dict["secondary_sat"] = secondarySatNumber.value;
        json_dict["secondary_val"] = secondaryValNumber.value;

        json_dict["background_hue"] = backgroundHueNumber.value;
        json_dict["background_sat"] = backgroundSatNumber.value;
        json_dict["background_val"] = backgroundValNumber.value;

        json_dict["background_theme"] = document.getElementById("background-type").value;
    

        const jsonString = JSON.stringify(json_dict, null, 2);

        var filename = document.getElementById('cardName').value.toTitleCase().replace(/[^0-9a-z ]/gi, '').replace(' ', '-');
        saveJSON(jsonString, filename);
        
    }

    /*document.getElementById('save-theme-button').addEventListener('click', async () => {

        var json_dict = {}
        json_dict["primary_hue"] = primaryHueNumber.value;
        json_dict["primary_sat"] = primarySatNumber.value;
        json_dict["primary_val"] = primaryValNumber.value;

        json_dict["secondary_hue"] = secondaryHueNumber.value;
        json_dict["secondary_sat"] = secondarySatNumber.value;
        json_dict["secondary_val"] = secondaryValNumber.value;

        json_dict["background_hue"] = backgroundHueNumber.value;
        json_dict["background_sat"] = backgroundSatNumber.value;
        json_dict["background_val"] = backgroundValNumber.value;

        json_dict["background_theme"] = document.getElementById("background-type").value;
    

        const jsonString = JSON.stringify(json_dict, null, 2);
    
        try {
            // Show the file save dialog
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: 'custom.json',
                types: [{
                    description: 'JSON Files',
                    accept: {'application/json': ['.json']}
                }]
            });
    
            // Create a writable stream
            const writableStream = await fileHandle.createWritable();
            
            // Write the JSON string to the file
            await writableStream.write(jsonString);
            
            // Close the file and write the contents to disk
            await writableStream.close();
    
            console.log('File saved successfully.');
        } catch (err) {
            console.error('Error saving file:', err);
        }
    });*/


    function triggerThemeLoader() {
        document.getElementById('themeLoader').click();
    }
    
    function drawText(ctx, text, x, y, family, size, color, alignment, spacing) {
        ctx.save();
        ctx.textBaseline = 'alphabetic';
        //    ctx.font = size + 'px ' + "'"+family+"'";
        ctx.font = size + 'px ' + family;
        //    console.log('dt: '+text+'   '+ctx.font);
        ctx.fillStyle = color;
        ctx.textAlign = alignment;
        ctx.letterSpacing = spacing;
        ctx.fillText(text, x, y);
        ctx.restore();
    }
    
    function fitText(ctx, text, x, y, family, size, color, alignment, width) {
        ctx.save();
        ctx.font = size + 'px ' + family;
        //    ctx.font = size + 'px ' + "'"+family+"'";
        //    console.log('ft: '+text+'   '+ctx.font);
        ctx.letterSpacing = 0;
        var textWidth = ctx.measureText(text).width;
        var spacing = 0;
        if (textWidth > width) {
            spacing -= (textWidth - width) / (text.length - 1);
        }
        ctx.restore();
        drawText(ctx, text, x, y, family, size, color, alignment, spacing);
    }
    
    //patches the context to have letterSpacing property and lsMeasureText()/lsFillText()
    function addCanvasLetterSpacing(ctx) {
        ctx.letterSpacing = 0;
        //must be in pixels;
    
        //only patch if we haven't already patched, else we will overwrite and all heck will break loose
        if (typeof ctx.origMeasureText == 'undefined')
            ctx.origMeasureText = ctx.measureText;
        if (typeof ctx.origFillText == 'undefined')
            ctx.origFillText = ctx.fillText;
    
        var needMeasureTextPatch = navigator.appName == 'Microsoft Internet Explorer' || (navigator.appName == "Netscape" && (navigator.appVersion.indexOf('Edge') > -1) || (navigator.appVersion.indexOf('Trident') > -1));
        //neither ie11 and edge 14 support canvas kerning. IE11 only returns whole pixels for measuretext. either way we need to measure text width differently.
    
        //a measureText that includes kerning, but doesn't support letterSpacing 
        ctx.kernedMeasureText = (function(text) {
            if (!needMeasureTextPatch) {
                //original canvas measureText is pretty good already
                return ctx.origMeasureText(text);
            } else {
                //ie11, edge14 don't inlcude kerning. ie11 doesn't return subpixel accuracy, so measure text using the DOM instead of canvas
    
                // cache result since DOM manipulation is slow
                var cacheStr = text + '^' + ctx.font;
                if (typeof (ctx.measureTextCache) == 'object' && ctx.measureTextCache[cacheStr]) {
                    return ctx.measureTextCache[cacheStr];
                }
    
                var node = document.createElement('div');
                node.style.position = 'absolute';
                node.style.top = '-1000px';
                node.style.left = '-1000px';
                node.style.font = ctx.font;
                node.style.whiteSpace = 'pre';
                node.style.fontFeatureSettings = '"kern" 1';
                node.style.fontKerning = 'normal';
                //probably unused by IE, Edge
                node.style.textRendering = 'optimizeLegibility';
                //ditto
                node.innerHTML = text;
                document.body.appendChild(node);
                //                    var result = {'width': node.offsetWidth, 'height': node.offsetHeight};    //integer only
                //                    var styles = window.getComputedStyle(node, null);
                //                  var result = {'width': styles['width'], 'height': styles['height']};    // two decimals only
                var dimensions = node.getBoundingClientRect();
                var result = {
                    'width': dimensions.width,
                    'height': dimensions.height
                };
                document.body.removeChild(node);
    
                if (typeof (ctx.measureTextCache) != 'object') {
                    ctx.measureTextCache = [];
                }
                ctx.measureTextCache[cacheStr] = result;
    
                //                    console.log('orig: ' + ctx.origMeasureText(text).width + '   calc: ' + result.width + '   text:' + text);
    
                return result;
            }
        }
        );
    
        ctx.measureText = (function(text) {
            var len = text.length;
            if (len == 0) {
                return ctx.origMeasureText(text);
            } else {
                var oldWidth = ctx.kernedMeasureText(text).width;
                var newWidth = oldWidth + parseFloat(ctx.letterSpacing || 0) * (len - 1);
                //                    Object.defineProperty(metrics,"width",{configurable:true,writeable:true,value:newWidth});   //maybe someday we'll get those other metrics we've been dreaming about, so fix this object instead of returning a new one.
                return {
                    'width': newWidth
                };
            }
        }
        );
    
        ctx.fillText = (function(text, x, y) {
            var spacing = parseFloat(ctx.letterSpacing || 0);
            // if letterSpacing is 0, we can just use the normal function
            if (spacing == 0) {
                ctx.origFillText(text, x, y);
                return;
            }
    
            var len = text.length;
            if (len < 1)
                return;
    
            //adjust start to fit alignment
            var cx = x;
            var saveAlign = ctx.textAlign;
            saveAlign = saveAlign.trim().toLowerCase();
            switch (saveAlign) {
            case "end":
            case "right":
                cx -= ctx.measureText(text).width;
                break;
            case "center":
                cx -= (ctx.measureText(text).width) / 2;
                break;
            default:
                //left-alignment
            }
    
            ctx.textAlign = 'left';
            //we always draw text from left to right
            ctx.origFillText(text[0], cx, y);
            var charWidth = 0;
            var pairWidth = 0;
            var advance = 0;
    
            for (var i = 1; i < len; i++) {
                //starting at second character
                //                    pairWidth = ctx.origMeasureText('' + text[i-1] + text[i]).width;
                //                    charWidth = ctx.origMeasureText(text[i]).width;
                pairWidth = ctx.kernedMeasureText('' + text[i - 1] + text[i]).width;
                charWidth = ctx.kernedMeasureText(text[i]).width;
                advance = pairWidth - charWidth + spacing;
                cx += advance;
                ctx.origFillText(text[i], cx, y);
            }
            ctx.textAlign = saveAlign;
        }
        );
    }
    
    //contours specify the padding for every 10 pixel height slice
    var contour = [[10, 65], [10, 65], [10, 50], [10, 44], [10, 40], [10, 40], [10, 33], [10, 33], [10, 28], [10, 28], [10, 22], [10, 22], [10, 18], [10, 18], [10, 15], [10, 15], [10, 12], [10, 12], [10, 10], [10, 10], [10, 10], [10, 10], [10, 10], [10, 10], [10, 10], [10, 10], [10, 10], [10, 10], [10, 12], [10, 12], [10, 15], [10, 15], [10, 18], [10, 18], [10, 21], [10, 21], [10, 25], [10, 25], [10, 29], [10, 29], [10, 34], [10, 34], [10, 38], [10, 38], [10, 30], [10, 30], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 14], [10, 28], [10, 45], [10, 62], [10, 80], [10, 97], [10, 115], [25, 132], [42, 150], [59, 167], [77, 185], [94, 202], [111, 220], [128, 237], [145, 255]];
    
    //build out our special powers text area variants
    var spSpecs = [{
        /* 0 - standard rectangular box */
        box: {
            followContour: false,
            top: 396,
            left: 325,
            width: 447,
            height: 900,
            leftPad: 20,
            rightPad: 53,
            topPad: -6.66 //don't remember why we have this magic number. has to do with getting to the correct first baseline. propogate everytime we change it.
        },
        header: {
            fontFamily: 'ScapeCondensedBold',
            fontSize: 33.3,
            baseline: 0.9,
            //approx baseline location, distance from top
            fontColor: '#121212',
            alignment: 'left',
            letterSpacing: -0.313,
            lineHeight: 1.1,
            spacingBefore: 26 //top margin
        },
        text: {
            fontFamily: 'ScapeCondensed',
            fontSize: 30.4,
            baseline: 0.9,
            //approx baseline location
            fontColor: '#121212',
            alignment: 'left',
            letterSpacing: 0.75,
            lineHeight: 1.16,
            spacingBefore: 0
        }
    }];
    
    /* 1 - same as above, but follow contours */
    var t = JSON.parse(JSON.stringify(spSpecs[spSpecs.length - 1]));
    t.box.followContour = true;
    t.box.height = 980;
    t.box.leftPad = 10;
    t.box.rightPad = 10;
    spSpecs.push(t);
    
    /* 2 - a created size, with a little smaller text */
    t = JSON.parse(JSON.stringify(spSpecs[spSpecs.length - 1]));
    t.header.fontSize = 31.6;
    t.text.fontSize = t.header.fontSize - 2.9;
    t.text.letterSpacing = 0.72;
    spSpecs.push(t);
    
    /* 3 - a created size, with a even smaller text */
    t = JSON.parse(JSON.stringify(spSpecs[spSpecs.length - 1]));
    t.header.fontSize = 29.8;
    t.text.fontSize = t.header.fontSize - 2.9;
    t.text.letterSpacing = 0.67;
    spSpecs.push(t);
    
    /* 4 - mohicans */
    t = JSON.parse(JSON.stringify(spSpecs[spSpecs.length - 1]));
    t.header.fontSize = 28.1;
    t.text.fontSize = t.header.fontSize - 2.9;
    t.text.letterSpacing = 0.625;
    spSpecs.push(t);
    
    /* 5 - repulsors */
    t = JSON.parse(JSON.stringify(spSpecs[spSpecs.length - 1]));
    t.box.topPad = 4 - 6.66;
    t.header.fontSize = 26.0;
    t.header.lineHeight = 1.06;
    t.header.spacingBefore = 16;
    t.text.fontSize = t.header.fontSize - 2.9;
    t.text.lineHeight = 1.26;
    t.text.letterSpacing = 0.625;
    spSpecs.push(t);
    
    /* 6 - getting desparate, reduce margins */
    t = JSON.parse(JSON.stringify(spSpecs[spSpecs.length - 1]));
    t.box.leftPad = 3;
    t.box.rightPad = 0;
    t.box.topPad = -7 - 6.66;
    spSpecs.push(t);
    
    /* 7 - more desparate, crunch text vertically */
    t = JSON.parse(JSON.stringify(spSpecs[spSpecs.length - 1]));
    t.text.lineHeight = 1.1;
    spSpecs.push(t);
    
    /* 8 - more desparate, also crunch text horizontally */
    t = JSON.parse(JSON.stringify(spSpecs[spSpecs.length - 1]));
    t.text.letterSpacing = 0.3;
    spSpecs.push(t);
    
    /* 9 - tiny red text to warn that there's too much text */
    t = JSON.parse(JSON.stringify(spSpecs[spSpecs.length - 1]));
    t.box.leftPad = 1;
    t.box.rightPad = -2;
    t.box.topPad = -9 - 6.66;
    t.header.fontSize = 24.0;
    t.header.fontColor = 'red';
    t.text.fontSize = t.header.fontSize - 2.9;
    t.text.fontColor = 'red';
    spSpecs.push(t);
    
    //for a given text baseline of y, calculate the start and ending available x coordinate
    //returns -1,-1 on error
    function calcStartEnd(passedY, textSpec, specs) {
    
        var y = passedY - specs.box.top;
    
        if (!specs.box.followContour) {
            if (y < specs.box.height) {
                //we don't fill up the bottom pointy area with the profile            
                return {
                    'start': specs.box.leftPad,
                    'end': specs.box.width - specs.box.rightPad
                };
                //just a rectangular box
            } else {
                return {
                    'start': -1,
                    'end': -1
                };
                //overflow
            }
        }
    
        if (Math.ceil((y + 0.1 * textSpec.fontSize) / 10) >= (contour.length)) {
            return {
                'start': -1,
                'end': -1
            };
            //overflow
        }
    
        //find which contours affect this line
        var minY = Math.floor((y - 0.8 * textSpec.fontSize) / 10);
        //top of text is about 80% above baseline
        var maxY = Math.floor((y + 0.1 * textSpec.fontSize) / 10);
        //bottom of text is about 10% below
    
        var leftPad = contour[minY][0];
        var rightPad = contour[minY][1];
        for (var i = minY + 1; i < Math.min(maxY, contour.length); i++) {
            leftPad = Math.max(leftPad, contour[i][0]);
            rightPad = Math.max(rightPad, contour[i][1]);
        }
    
        //adjust margin tightness based on specs
        leftPad += specs.box.leftPad;
        rightPad += specs.box.rightPad;
    
        return {
            'start': leftPad,
            'end': specs.box.width - rightPad
        };
    }
    
    function measureWord(ctx, text, textSpec) {
        var saveFont = ctx.font;
        var saveLetterSpacing = ctx.letterSpacing;
    
        ctx.font = textSpec.fontSize + 'px ' + textSpec.fontFamily;
        //"'"+textSpec.fontFamily+"'";
        ctx.letterSpacing = textSpec.letterSpacing;
        var result = ctx.measureText(text).width;
    
        ctx.font = saveFont;
        ctx.letterSpacing = saveLetterSpacing;
        return result;
    }
    
    //given sanitized text at this point where all hard lines breaks are
    //marked by a ' \n ', and all double spaces are removed, let's do this!
    //returns y of baseline of last line of text or returns false if the text overflowed
    function drawParagraph(ctx, text, top, textSpec, spec) {
    
        var words = text.split(' ');
        var x = 0;
        var bounds = {};
    
        var startNewLine = true;
        var y = top + textSpec.spacingBefore;
        // top is baseline of the text drawn before this call to drawParagraph
    
        var line = '';
        //accumulate words to draw. due to small negative advance kerning adjustments next to spaces, we need to write the whole line at once 
    
        for (i = 0; i < words.length; i++) {
            if (startNewLine) {
                //calculate new y baseline
                y += textSpec.fontSize * textSpec.lineHeight;
                //find our new x boundary
                bounds = calcStartEnd(y, textSpec, spec);
                x = bounds.start;
                if (x == -1) {
                    return false;
                    //overflowed
                }
                startNewLine = false;
            }
    
            word = words[i];
            if (word == '\n') {
                startNewLine = true;
            } else {
                //normal word
                if (x != bounds.start) {
                    //not at the start of the line
                    word = ' ' + word;
                }
                var wordWidth = measureWord(ctx, word, textSpec);
                var fullWidth = measureWord(ctx, line + word, textSpec);
                //                if (x + wordWidth > bounds.end) {     //unfortunately this comparison doesn't work. negative advances when kerning on everything but firefox seem to mess this up, so we end up doing the fullWidth calc above and the comparison on the next line instead. that sucks cuz it is so much slower.
                if (fullWidth > (bounds.end - bounds.start)) {
                    //too wide to be added to this line so start a new one
                    startNewLine = true;
                    i--;
                    //reprocess this word on the new line
                } else {
                    line += word;
                    x += wordWidth + textSpec.letterSpacing;
                    //our measuretext doesn't include the last character's letterSpacing so we have to add it back in
                }
            }
            if (startNewLine || i == words.length - 1) {
                if (line != '') {
                    drawText(textCtx, line, bounds.start + spec.box.left, y, textSpec.fontFamily, textSpec.fontSize, textSpec.fontColor, textSpec.alignment, textSpec.letterSpacing);
                    //                    drawText(textCtx, '.', bounds.end + left, y, textSpec.fontFamily, textSpec.fontSize, 'red', 'right', 0);
                    line = '';
                }
            }
        }
        return y;
    }
    
    /* draws something as either one or two lines, changing letterSpacing
    to make it fit if necessary. used for card title and eventually
    special power heading. could be adjusted to draw text on [1..n] lines
    instead of just [1..2]
    
    returns y of baseline of last line oxff text
    
    TODO: right now we are assuming vertical centering
     */
    function drawMultiline(ctx, text, textSpec, spec) {
    
        //calculate x location to place text
        var x = spec.box.left;
        if (textSpec.alignment == 'center') {
            x += spec.box.width / 2;
        } else if (textSpec.alignment == 'right') {
            x += spec.box.width;
        }
    
        var y = spec.box.top;
    
        var totalWidth = measureWord(ctx, text, textSpec);
        if (totalWidth <= spec.box.width) {
            var spacingBefore = (spec.box.height - textSpec.fontSize) / 2;
            y += spacingBefore + textSpec.baseline * textSpec.fontSize;
            drawText(ctx, text, x, y, textSpec.fontFamily, textSpec.fontSize, textSpec.fontColor, textSpec.alignment, textSpec.letterSpacing);
        } else {
            //first we divide the line into two as-equal-as-possible lines
            //text is short enough that we can do this with an exhaustive search
            var candidates = [];
            var words = text.split(' ');
            var numCandidates = words.length - 1;
    
            for (var i = 0; i < numCandidates; i++) {
                candidates[i] = {}
            }
    
            for (var i = 0; i < numCandidates; i++) {
                //i is last word in first line for this candidate
    
                if (i == 0) {
                    candidates[i].first = words[0];
                    //very first word. don't include a space
                    candidates[numCandidates - 1].second = words[numCandidates];
                    //very last word. ditto
                } else {
                    candidates[i].first = candidates[i - 1].first + ' ' + words[i];
                    candidates[numCandidates - i - 1].second = words[numCandidates - i] + ' ' + candidates[numCandidates - i].second;
                }
            }
    
            var minDiff = 999999;
            var bestCandidate = -1;
            for (var i = 0; i < numCandidates; i++) {
                candidates[i].firstWidth = measureWord(ctx, candidates[i].first, textSpec);
                candidates[i].secondWidth = measureWord(ctx, candidates[i].second, textSpec);
                candidates[i].diff = Math.abs(candidates[i].firstWidth - candidates[i].secondWidth);
                if (candidates[i].firstWidth <= spec.box.width && candidates[i].secondWidth <= spec.box.width && candidates[i].diff <= minDiff) {
                    minDiff = candidates[i].diff;
                    bestCandidate = i;
                }
            }
    
            var fixedSpec = JSON.parse(JSON.stringify(textSpec));
            // fixedSpec might be adjusted below with a smaller letterSpacing (or eventually smaller font or x-stretch)
    
            if (bestCandidate == -1) {
                // none of the options fit on their lines, so we have to adjust the textSpec to make it work
                var minAdjust = 999999;
                //smallest adjustment to letterSpacing we have to do to make lines fit
                for (var i = 0; i < numCandidates; i++) {
                    var firstAdjust = (candidates[i].firstWidth - spec.box.width) / (candidates[i].first.length - 1);
                    var secondAdjust = (candidates[i].secondWidth - spec.box.width) / (candidates[i].second.length - 1);
                    var neededAdjust = Math.max(firstAdjust, secondAdjust);
    
                    if (neededAdjust < minAdjust) {
                        minAdjust = neededAdjust;
                        bestCandidate = i;
                    }
                }
                fixedSpec.letterSpacing -= minAdjust;
            }
    
            var spacingBefore = (spec.box.height - fixedSpec.fontSize - (fixedSpec.fontSize * fixedSpec.lineHeight)) / 2;
            y += spacingBefore + fixedSpec.baseline * fixedSpec.fontSize;
            drawText(ctx, candidates[bestCandidate].first, x, y, fixedSpec.fontFamily, fixedSpec.fontSize, fixedSpec.fontColor, fixedSpec.alignment, fixedSpec.letterSpacing);
            y += fixedSpec.fontSize * fixedSpec.lineHeight;
            drawText(ctx, candidates[bestCandidate].second, x, y, fixedSpec.fontFamily, fixedSpec.fontSize, fixedSpec.fontColor, fixedSpec.alignment, fixedSpec.letterSpacing);
    
            //we are now ready to draw the two lines.
    
            //TODO: draw the lines
            //        var spacingBefore = (spec.box.height - textSpec.fontSize) / 2;
            //            y += textSpec.fontSize * textSpec.lineHeight;
        }
        return y;
    }
    
    function cleanString(input) {
    
        return input.replace(/^\s+|\s+$/g, '')// trim leading/trailing whitespace
        .replace(/[ \f\r\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff][ \f\r\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+/g, ' ')// double spaces to single
        //                .replace('  ',' ')				// double spaces to single
        //                .replace(/[\r]/g, '\n')			// replace carriage returns w line breaks
        .replace(' \n', '\n')// remove spaces around line breaks
        .replace('\n ', '\n')//                .replace(/\n\s*\n/g, '\n')		// multiple line breaks replaced with one
        .replace(/[\n][\n]+/g, '\n')// multiple line breaks replaced with one
        .replace('\n', ' \n ')// add whitespace back to make \n a 'word'
        .replace("'", "’")// replace straight apostrophe with curly
        .replace('20 sided', '20-sided')// auto-fixup item (remove?)
        .trim();
        // final native trim for good measure
        //will not remove a bunch of " \n" in a row. they will still persist as multiple \n
    
    }
    
    function drawTitle(overrideTribe=false) {
    
        //TODO: need to textSpec-ify this for future template compatibility
        var titleSpec = {
            fontFamily: 'ScapeCondensedHeavy',
            fontSize: 42.7,
            baseline: 0.9,
            //approx baseline location
            fontColor: '#fff',
            alignment: 'center',
            letterSpacing: 0,
            lineHeight: 1.03,
            spacingBefore: 0
        };
        var titleArea = {
            'box': {
                'left': 333,
                'top': 269,
                'width': 320,
                'height': 124 - 29.2
            }
        }
        //height it total title area minus the height of general name FIXME: i don't think the left and width leave any padding area'
    
        var cardName = cleanString(document.getElementById('cardName').value.toUpperCase());
        var generalName = cleanString(document.getElementById('tribeName').value.toUpperCase());
        if (overrideTribe || generalName == "") {
            generalName = cleanString(document.getElementById('generalName').value.toUpperCase());
            document.getElementById('tribeName').value = "";
        }
    
        textCtx.clearRect(300, 250, 400, 150);
    
        /*    //title area. FIXME: hardcoded to 1-liner at the moment. box is l 333, t 269. w 320, h 124 
        fitText(textCtx, cardName, 493, 331, 'ScapeCondensedHeavy', 42.7, '#fff', 'center', 320);  // line height 1.03
        fitText(textCtx, generalName, 493, 362, 'ScapeCondensedMedium', 29.2, '#fff', 'center', 320);
    */
        var y = drawMultiline(textCtx, cardName, titleSpec, titleArea);
        fitText(textCtx, generalName, 493, y + 29.2, 'ScapeCondensedMedium', 29.2, '#fff', 'center', 320);
    
        drawSymbol();
    }

    function drawSymbol() {
        var symbols = {
            "aquilla": "M 499.52857,1.83e-4 68.344356,250.80655 l 0,499.06073 431.574104,250.13292 431.82222,-250.13292 0,-499.06073 L 499.52857,1.83e-4 M 792.08875,663.8431 c -27.32784,-28.21395 -78.93525,-57.63301 -78.93525,-57.63301 63.90671,62.7016 85.52795,109.24042 85.52795,109.24042 -102.93128,-56.42788 -239.18053,-59.12167 -239.18053,-59.12167 172.26103,42.60446 196.85961,78.33267 196.85961,78.33267 -74.71733,-10.81061 -142.2394,7.51428 -142.2394,7.51428 44.69572,0.56711 126.14753,31.65207 126.14753,31.65207 40.90312,-23.49981 76.87945,-44.16403 97.68546,-56.14433 0,0 -18.573,-25.66193 -45.86537,-53.84043 M 611.78178,847.65908 c -62.77247,36.04721 -112.92666,64.89916 -112.92666,64.89916 L 141.60846,706.80201 c 0,0 0,-88.54073 0,-183.70963 0,0 51.14663,-16.83622 91.65987,-16.83622 40.51324,0 76.525,12.2993 84.92539,50.43775 0,0 -77.12756,25.20115 -108.35431,62.70159 0,0 61.85092,-9.00294 142.27485,18.00589 80.42391,27.00882 138.34047,49.83519 204.37387,97.54369 0,0 -73.83122,3.29635 -118.24337,18.32488 0,0 48.91362,11.69674 84.03927,31.5103 35.09022,19.81355 75.70979,44.87293 89.49775,62.87882 M 141.60846,501.7547 c 0,-103.53384 0,-208.69812 0,-208.69812 L 498.85512,86.414246 856.91701,293.05658 c 0,0 0,131.96045 0,246.80112 0,0 -36.22444,-54.44299 -45.4046,-74.04389 -9.18016,-19.56545 -20.80601,-49.55162 -20.80601,-70.5703 0,-20.98323 7.33705,-38.52833 17.33243,-48.31106 0,0 -114.41533,-9.39284 -114.41533,-47.92117 0,-30.8014 69.15251,-47.74395 69.15251,-47.74395 0,0 -85.06716,-43.24248 -212.73881,-43.24248 -127.63619,0 -259.1713,48.24018 -365.68249,187.78578 0,0 154.53869,-127.2463 304.0088,-127.2463 60.61035,0 93.04221,18.60843 93.04221,18.60843 0,0 -70.53486,16.80077 -92.43966,30.90774 0,0 18.892,-2.37479 29.41906,-2.37479 10.49163,0 148.8321,2.09123 287.20804,219.68597 0,0 -29.41906,-12.01574 -55.54178,-12.01574 0,0 67.23852,43.52604 105.34152,126.04119 0,0 -75.31989,-75.63889 -138.34049,-100.84004 0,0 -94.84989,70.21585 -207.67023,70.21585 -79.5378,0 -172.58002,-48.59461 -172.58002,-117.6408 0,-37.50045 29.70262,-59.72424 29.70262,-59.72424 0,0 -23.39347,0.319 -35.40921,0.319 -12.01574,0 -106.97196,7.79783 -189.48711,60.0078 m 372.2752,-146.45731 c 0,0 -52.84799,21.30224 -52.84799,81.02647 0,59.72425 54.33666,87.05208 86.13051,87.05208 59.44069,0 79.25425,-54.93921 79.25425,-54.93921 0,0 0,97.26012 -106.26307,97.26012 -64.50928,0 -102.93128,-55.82532 -102.93128,-104.45539 0,-63.30416 55.82533,-105.94407 96.65758,-105.94407",
            "einar": "M 499.48605,1.83e-4 68.301836,250.80655 l 0,499.06073 431.574104,250.13292 431.82222,-250.13292 0,-499.06073 L 499.48605,1.83e-4 m -0.67345,86.16595 -357.24666,206.677777 0,413.70999 357.24666,205.75623 358.06189,-205.75623 0,-413.70999 L 498.8126,86.166133 m 3.43814,69.790517 c 0,0 -66.10429,23.21625 -114.0609,131.42878 0,0 54.26576,-10.17262 114.13179,86.48496 0,0 55.68355,-93.503 115.54956,-85.42161 0,0 -42.78169,-102.36417 -115.62045,-132.49213 m -74.15023,161.52129 c 0,0 -18.573,5.9547 -63.37503,5.9547 -90.70288,0 -157.90594,-40.97401 -157.90594,-40.97401 0,0 8.40039,25.94548 33.95599,41.32846 25.55558,15.41842 63.37503,25.5556 102.22237,57.77479 38.88279,32.21918 56.038,45.51093 74.93,64.08393 18.92745,18.53755 36.4371,42.00192 81.59359,42.00192 45.1565,0 69.32975,-26.58349 85.06717,-40.93858 15.77288,-14.35509 46.92873,-45.90082 69.32974,-63.05604 22.40103,-17.15521 39.23724,-28.35572 69.32975,-40.26512 30.12795,-11.90941 58.48368,-32.18375 69.32974,-59.15713 0,0 -71.77543,39.91068 -151.24234,39.91068 -35.72821,0 -73.9021,-7.69149 -73.9021,-7.69149 0,0 49.01995,20.66423 49.01995,43.7387 0,33.28253 -67.91195,101.54894 -115.54956,101.54894 -44.80205,0 -116.57748,-65.82073 -116.57748,-98.71336 0,-28.39118 43.77415,-45.54639 43.77415,-45.54639 m -180.09428,40.7968 c 0,0 8.79027,-2.23301 19.03378,-2.23301 10.27895,0 32.29008,3.26091 47.81484,30.02162 15.52475,26.79615 33.53064,29.7735 47.31861,36.04721 13.75253,6.23825 35.76365,24.27959 38.03212,45.29827 0,0 -26.54805,16.2691 -56.32157,16.2691 -29.7735,0 -53.06063,-22.5428 -53.06063,-59.33435 0,-36.75612 -4.74959,-49.55163 -42.81715,-66.06884 m 504.12931,0 c 0,0 -8.75483,-2.23301 -18.99834,-2.23301 -10.27894,0 -32.29007,3.26091 -47.81484,30.02162 -15.52475,26.79615 -33.53063,29.7735 -47.31861,36.04721 -13.75252,6.23825 -35.7991,24.27959 -38.03211,45.29827 0,0 26.5126,16.2691 56.32156,16.2691 29.7735,0 53.06064,-22.5428 53.06064,-59.33435 0,-36.75612 4.74959,-49.55163 42.7817,-66.06884 M 517.35015,624.32231 c 23.78336,0 67.34485,33.28253 88.61164,52.77709 21.30224,19.53 51.57197,56.32155 96.37401,56.32155 44.80205,0 80.35304,-27.00882 80.35304,-66.81317 0,-39.80434 -42.32093,-73.08688 -76.5959,-91.83709 -34.27499,-18.78568 -95.38156,-36.79155 -106.1213,-38.56379 -10.77518,-1.73679 -11.02329,-4.50147 -11.02329,-4.50147 22.5428,3.50902 43.06526,-8.75483 43.06526,-24.5277 0,-15.73743 -17.79322,-24.24414 -32.5382,-24.24414 -14.78041,0 -30.55328,11.98029 -41.57657,18.75022 -10.98784,6.76993 -28.24939,9.74728 -36.54344,10.77518 -8.2586,0.99245 -34.31042,0.99245 -42.56902,0 -8.25862,-1.0279 -25.52015,-4.00525 -36.54344,-10.77518 -10.98785,-6.76993 -26.76071,-18.75022 -41.54114,-18.75022 -14.78042,0 -32.53819,8.50671 -32.53819,24.24414 0,15.77287 20.52245,28.03672 43.06525,24.5277 0,0 -0.24811,2.76468 -11.02328,4.50147 -10.77518,1.77224 -71.84632,19.77811 -106.1213,38.56379 -34.31043,18.75021 -76.59589,52.03275 -76.59589,91.83709 0,39.80435 35.55099,66.81317 80.35302,66.81317 44.80204,0 75.07178,-36.79155 96.33858,-56.32155 21.30224,-19.49456 64.82826,-52.77709 88.61162,-52.77709 l 34.55854,0 M 407.71984,495.94178 c 9.25106,0 37.784,13.2563 37.784,21.76301 0,8.50672 -10.77518,9.25106 -17.01343,9.25106 -6.27371,0 -37.03966,-5.74204 -37.03966,-19.77812 0,-8.75483 7.51426,-11.23595 16.26909,-11.23595 m 74.07932,88.32807 c -9.25105,0.74434 -29.7735,6.02559 -52.56441,16.02099 -22.79091,9.99539 -46.29072,25.76826 -65.3245,39.80434 -19.03377,14.00063 -43.31337,22.75547 -53.55687,22.75547 -10.27895,0 -26.29994,-5.74204 -26.29994,-25.02392 0,-19.2819 19.77812,-30.51785 39.80435,-39.06002 20.02622,-8.47127 48.06295,-19.74267 82.83416,-31.26218 34.80665,-11.51952 74.11476,-12.51197 74.11476,-12.51197 l 38.56379,0 c 0,0 39.30813,0.99245 74.07933,12.51197 34.80665,11.51951 62.84337,22.79091 82.8696,31.26218 20.02622,8.54217 39.7689,19.77812 39.7689,39.06002 0,19.28188 -16.02098,25.02392 -26.26449,25.02392 -10.27895,0 -34.55854,-8.75484 -53.55688,-22.75547 -19.03377,-14.03608 -42.56902,-29.80895 -65.32448,-39.80434 -22.79092,-9.9954 -43.31338,-15.27665 -52.56443,-16.02099 -9.2865,-0.74434 -27.32782,-0.74434 -36.57889,0 m 110.65822,-88.32807 c -9.25105,0 -37.784,13.2563 -37.784,21.76301 0,8.50672 10.73972,9.25106 17.01343,9.25106 6.23825,0 37.03967,-5.74204 37.03967,-19.77812 0,-8.75483 -7.51428,-11.23595 -16.2691,-11.23595",
            "jandar": "M 499.52857,1.83e-4 68.344356,250.80655 l 0,499.06073 431.574104,250.13292 431.82222,-250.13292 0,-499.06073 L 499.52857,1.83e-4 m -0.638,86.378625 -357.28211,206.677772 0,413.71 357.28211,205.75622 358.02644,-205.75622 0,-413.71 L 498.89057,86.378808 m 29.48995,480.700382 c 55.9671,-4.89136 97.54369,-33.95598 97.54369,-33.95598 0,0 0.92156,-15.59565 -0.60256,-47.10593 -1.52413,-31.5103 -8.86117,-86.55585 -31.5103,-130.29455 -22.61369,-43.7387 -78.61624,-65.46628 -85.95329,-67.91197 -7.33704,-2.44567 -10.20805,-2.44567 -17.5451,0 -7.37249,2.44569 -63.3396,24.17327 -85.95329,67.91197 -22.64912,43.7387 -29.98617,98.78425 -31.5103,130.29455 -1.52411,31.51028 -0.60255,47.10593 -0.60255,47.10593 0,0 41.57658,29.06462 97.54369,33.95598 0,0 21.97569,1.20512 28.67472,1.20512 6.69904,0 29.91529,-1.20512 29.91529,-1.20512 m 20.48701,28.14306 c -7.65605,-2.16212 -19.88446,-6.13192 -24.49226,-4.00525 -5.24581,2.48113 -24.66947,1.84313 -34.98387,1.84313 -5.21037,0 -11.02329,0.319 -15.59565,-1.84313 -4.6078,-2.12667 -16.8362,1.84313 -24.49225,4.00525 -7.6206,2.12668 -18.04133,3.9698 -28.74562,-5.52936 -10.70428,-9.46373 -22.93268,-28.74563 -22.93268,-28.74563 30.58872,15.59565 76.45411,22.33014 82.8696,22.64914 6.45092,0.28356 16.12731,0.7089 19.56543,0.7089 3.40269,0 11.16508,-0.42534 17.616,-0.7089 6.41548,-0.319 52.28087,-7.05349 82.8696,-22.64914 0,0 -12.2284,19.2819 -22.93268,28.74563 -10.70429,9.49916 -21.12502,7.65604 -28.74562,5.52936 m -204.16121,-215.32627 34.87754,7.33705 -3.36724,8.2586 -33.95597,-7.33705 2.44567,-8.2586 m -7.01804,26.58348 -4.60781,17.15522 35.19655,7.01805 4.57235,-16.80078 -35.16109,-7.37249 m -8.57761,35.19655 -2.12667,21.40857 36.68521,8.25861 2.76469,-21.12501 -37.32323,-8.54217 m -3.9698,39.13089 -1.52411,16.51721 37.00421,9.78273 1.84313,-17.11976 -37.32323,-9.18018 m -0.60256,34.55854 -0.60255,5.81292 35.76365,16.23365 0.319,-11.62583 -35.4801,-10.42074 m -12.8664,-1.80768 c 0,0 -3.6508,-74.93 21.12501,-125.40318 0,0 -15.59565,-6.13193 -15.59565,-17.15522 0,-10.98783 9.18016,-23.85425 36.68521,-43.7387 27.5405,-19.88445 68.83353,-49.23262 83.79117,-60.85846 14.99308,-11.62585 32.43186,-26.29994 32.43186,-45.86539 0,-19.56545 -15.91465,-42.81713 -81.06193,-40.0879 0,0 42.53359,6.45093 42.53359,23.85425 0,17.43878 -37.32322,40.4069 -77.09212,54.76199 -39.73347,14.39054 -126.89187,48.63006 -126.89187,128.45143 0,99.42225 84.07473,126.04118 84.07473,126.04118 m 341.79279,-133.66178 -34.87754,7.33705 3.36725,8.2586 33.95597,-7.33705 -2.44568,-8.2586 m 7.01805,26.58348 4.6078,17.15522 -35.19654,7.01805 -4.57236,-16.80078 35.1611,-7.37249 m 8.5776,35.19655 2.12668,21.40857 -36.68522,8.25861 -2.76468,-21.12501 37.32322,-8.54217 m 3.9698,39.13089 1.52412,16.51721 -37.00422,9.78273 -1.84312,-17.11976 37.32322,-9.18018 m 0.60256,34.55854 0.60256,5.81292 -35.76366,16.23365 -0.319,-11.62583 35.4801,-10.42074 m 12.86641,-1.80768 c 0,0 3.6508,-74.93 -21.12501,-125.40318 0,0 15.59564,-6.13193 15.59564,-17.15522 0,-10.98783 -9.18017,-23.85425 -36.68522,-43.7387 -27.5405,-19.88445 -68.83351,-49.23262 -83.79116,-60.85846 -14.99309,-11.62585 -32.43185,-26.29994 -32.43185,-45.86539 0,-19.56545 15.91465,-42.81713 81.02648,-40.0879 0,0 -42.49814,6.45093 -42.49814,23.85425 0,17.43878 37.32321,40.4069 77.09211,54.76199 39.73346,14.39054 126.89186,48.63006 126.89186,128.45143 0,99.42225 -84.07471,126.04118 -84.07471,126.04118 m -188.9909,137.45438 c -13.92975,0 -23.28714,-14.81588 -23.28714,-14.81588 0,0 -16.62353,15.02854 -38.06755,15.02854 -38.06756,0 -37.146,-66.56506 -78.19091,-66.56506 -24.42136,0 -27.36327,24.63404 -27.36327,29.87985 0,5.2458 2.48112,9.57005 6.13192,9.57005 3.6508,0 8.89661,-5.03314 8.89661,-11.16506 0,-6.16738 6.62815,-12.08663 14.81587,-12.08663 8.22316,0 25.09481,12.97274 25.09481,28.95828 0,15.9501 -12.76008,27.36327 -27.36326,27.36327 -27.11517,0 -48.34652,-62.48892 -81.84172,-62.48892 -18.92743,0 -23.96058,16.65898 -23.96058,25.98093 0,9.35739 3.89891,18.46667 10.73973,18.46667 6.84082,0 7.97504,-7.26615 7.97504,-11.83852 0,-4.57236 -3.89891,-17.79321 5.24581,-17.79321 9.10928,0 28.71018,17.79321 41.93103,39.44989 13.22086,21.65669 25.09481,31.93564 44.23492,36.04722 19.17557,4.07613 20.77058,13.43352 20.77058,18.67933 0,5.24581 -3.43814,16.87166 -20.06168,16.87166 -26.01637,0 -36.72066,-33.74331 -66.3524,-33.74331 -24.17325,0 -23.25168,21.65667 -23.25168,27.1506 0,5.45847 5.21036,22.11746 17.08432,22.11746 11.83851,0 6.84081,-16.1982 3.19001,-20.06167 -3.6508,-3.89892 -3.6508,-11.41318 4.32425,-11.41318 7.97505,0 15.98554,9.35739 30.09252,19.38823 14.14241,10.03083 26.22905,15.48931 38.31567,15.48931 7.76238,0 13.46896,-2.51658 13.46896,-2.51658 0,0 -3.89891,14.6032 6.38004,21.9048 10.24351,7.3016 24.38593,13.89432 24.38593,34.41677 0,8.01048 -4.32425,16.65898 -9.81818,16.65898 -2.26845,0 -11.83851,-4.32425 -11.83851,7.3016 0,8.18772 8.43584,10.2435 12.2993,10.2435 3.89891,0 21.9048,3.19003 24.42136,-42.63991 0,0 25.52015,30.8014 43.77415,30.8014 18.21855,0 37.85489,12.97274 37.85489,28.4975 0,20.73513 -13.46896,15.27665 -13.46896,29.41906 0,5.45849 5.91925,10.70429 10.27895,10.70429 4.32425,0 23.00357,-6.38004 23.00357,-44.23492 0,-37.85489 -18.00589,-43.1007 -18.00589,-70.46398 0,-12.51196 12.2993,-21.65669 25.30749,-21.65669 13.00819,0 23.4998,9.35739 23.4998,24.63404 0,15.27665 -18.25399,22.11746 -18.25399,41.25758 0,19.17556 13.46897,30.34062 19.14012,28.74561 5.70658,-1.595 6.62815,-11.87395 5.70658,-18.92744 -0.88611,-7.05349 -0.21267,-18.254 8.68394,-23.2517 8.89661,-5.03314 22.79091,-13.46896 22.79091,-28.74561 0,-15.27664 -7.05348,-27.11516 -7.05348,-33.53064 0,-6.38004 3.6508,-10.70429 7.51427,-10.70429 13.8943,0 21.44401,21.44402 46.0426,21.44402 18.46666,0 37.64223,-16.41088 46.29071,-43.34882 8.68395,-26.90248 12.08664,-38.98911 16.19822,-38.98911 4.11157,0 7.3016,4.35969 5.91926,9.6055 -1.3469,5.24581 -7.05349,15.02854 -7.05349,20.06168 0,4.99768 2.26845,8.43582 5.70659,8.43582 3.40269,0 9.32194,-3.19002 12.97274,-19.17556 3.6508,-15.95009 1.84312,-35.55099 -15.27664,-35.55099 -31.90019,0 -21.86936,62.24081 -63.37505,62.24081 -23.96059,0 -31.68751,-15.95008 -31.68751,-28.71016 0,-12.79552 8.43582,-17.11977 8.43582,-17.11977 0,0 29.48995,3.43813 39.66256,-4.78503 17.79323,-14.35509 16.41088,-38.31567 26.9025,-38.31567 6.84082,0 5.49392,9.35738 13.68164,9.35738 3.43813,0 6.38004,-4.57235 6.38004,-9.10927 0,-4.57235 -4.11159,-16.9071 -18.21856,-16.9071 -14.14242,0 -17.79322,11.87396 -21.44402,22.36559 -3.6508,10.49161 -12.76007,23.92513 -30.55328,23.92513 -17.79322,0 -22.11747,-6.13192 -22.11747,-26.44171 0,-20.27434 10.70429,-34.20409 26.22904,-34.20409 15.48931,0 34.66488,5.2458 44.23493,-10.70428 9.57006,-15.98554 10.03083,-30.5533 5.91926,-37.18145 -4.11158,-6.5927 -16.65899,-4.78503 -16.65899,3.89891 0,4.53692 2.76469,7.26616 2.76469,13.89431 0,6.5927 -5.9547,16.65899 -21.23135,16.65899 -15.27665,0 -29.8444,-5.24581 -40.7968,8.18771 -10.9524,13.46896 -13.46896,37.64223 -30.55329,50.86308 -17.11977,13.22086 -22.57825,15.48931 -33.06986,15.48931 -10.49163,0 -28.4975,-11.37773 -31.01408,-16.41088 0,0 -10.03083,14.14243 -23.46436,14.14243",
            "ullar": "M 499.52857,1.83e-4 68.344356,250.80655 l 0,499.06073 431.574104,250.13292 431.82222,-250.13292 0,-499.06073 L 499.52857,1.83e-4 m -0.67345,86.414063 -357.24666,206.642334 0,413.74543 357.24666,205.75623 358.06189,-205.75623 0,-413.74543 L 498.85512,86.414246 m 1.06334,52.777094 c 0,0 -6.30915,3.40269 -9.46373,7.08892 l 19.81357,0 c 0,0 -4.04069,-4.71413 -10.34984,-7.08892 m 42.25002,504.90909 -5.70658,-21.33768 c 38.74101,-9.2865 64.58016,-29.41906 84.99628,-54.33666 20.41612,-24.91759 27.32783,-55.86078 39.62712,-78.97069 12.33475,-23.14536 26.72527,-36.04721 26.72527,-36.04721 C 680.01275,392.44339 658.07251,313.18914 620.85562,257.93093 583.60328,202.67271 517.2509,151.91596 517.2509,151.91596 l -34.02687,0 c 0,0 -66.3524,50.75675 -103.60472,106.01497 -37.21689,55.25821 -59.15713,134.51246 -66.95495,195.47726 0,0 14.42597,12.90185 26.72526,36.04721 12.2993,23.10991 19.211,54.0531 39.62713,78.97069 20.45156,24.9176 46.25527,45.05016 84.99627,54.33666 l -5.70659,21.33768 c 0,0 16.2691,9.39283 43.06527,9.39283 26.76071,0 40.79678,-9.39283 40.79678,-9.39283 M 316.98861,487.64773 c 0,0 17.5451,22.43646 21.72756,43.45515 0,0 -4.18246,39.94612 -4.18246,65.85616 0,25.94549 13.29174,122.28405 51.85552,208.8399 0,0 -74.64643,-104.7744 -74.64643,-225.28623 0,-63.80037 5.24581,-92.86498 5.24581,-92.86498 m 54.65565,111.08355 c 0,0 29.10006,38.88277 57.84567,44.48303 0,0 -10.52706,30.83685 -10.52706,53.59232 0,36.47255 15.77288,79.18336 15.77288,79.18336 0,0 -38.88279,-45.19194 -52.56443,-98.78425 -13.68164,-53.62776 -10.52706,-78.47446 -10.52706,-78.47446 M 682.77743,487.64773 c 0,0 -17.50966,22.43646 -21.72757,43.45515 0,0 4.21791,39.94612 4.21791,65.85616 0,25.94549 -13.32719,122.28405 -51.85552,208.8399 0,0 74.61098,-104.7744 74.61098,-225.28623 0,-63.80037 -5.2458,-92.86498 -5.2458,-92.86498 m -54.65566,111.08355 c 0,0 -29.10006,38.88277 -57.81022,44.48303 0,0 10.49161,30.83685 10.49161,53.59232 0,36.47255 -15.77288,79.18336 -15.77288,79.18336 0,0 38.91824,-45.19194 52.56443,-98.78425 13.68164,-53.62776 10.52706,-78.47446 10.52706,-78.47446 m -110.3392,-434.87047 0,-5.77747 -34.94844,0 0,5.77747 34.94844,0 m 0,12.76008 0,-5.77748 -34.94844,0 0,5.77748 34.94844,0 m 0,12.58285 0,-5.77748 -34.94844,0 0,5.77748 34.94844,0 m 0,12.76007 0,-5.81292 -34.94844,0 0,5.81292 34.94844,0 m 0,12.97275 0,-5.77748 -34.94844,0 0,5.77748 34.94844,0 m 0,12.76008 0,-5.77749 -34.94844,0 0,5.77749 34.94844,0 m 0,12.58285 0,-5.77748 -34.94844,0 0,5.77748 34.94844,0 m 0,12.72462 0,-5.77747 -34.94844,0 0,5.77747 34.94844,0 m 0,12.6183 0,-5.77747 -34.94844,0 0,5.77747 34.94844,0 m 0,12.72464 0,-5.77749 -34.94844,0 0,5.77749 34.94844,0 m 0,12.61829 0,-5.77748 -34.94844,0 0,5.77748 34.94844,0 m 0,12.72464 0,-5.77749 -34.94844,0 0,5.77749 34.94844,0 m 0,13.00818 0,-5.77748 -34.94844,0 0,5.77748 34.94844,0 m 0,12.72463 0,-5.74204 -34.94844,0 0,5.74204 34.94844,0 m 0,12.6183 0,-5.77748 -34.94844,0 0,5.77748 34.94844,0 m 0,12.72462 0,-5.77747 -34.94844,0 0,5.77747 34.94844,0 m 0,12.9373 0,-5.77747 -34.94844,0 0,5.77747 34.94844,0 m 0,12.58285 0,-5.77747 -34.94844,0 0,5.77747 34.94844,0 m 0,12.76008 0,-5.77748 -34.94844,0 0,5.77748 34.94844,0 m 0,12.97275 0,-5.77748 -34.94844,0 0,5.77748 34.94844,0 m 0,12.76007 0,-5.77747 -34.94844,0 0,5.77747 34.94844,0 m 0,12.58285 0,-5.77747 -34.94844,0 0,5.77747 34.94844,0 m 0,12.76008 0,-5.77748 -34.94844,0 0,5.77748 34.94844,0 m 0,12.58285 0,-5.77748 -34.94844,0 0,5.77748 34.94844,0 m 0,12.76007 0,-5.77747 -34.94844,0 0,5.77747 34.94844,0 m 0,12.58287 0,-5.77749 -34.94844,0 0,5.77749 34.94844,0 m 0,12.72462 0,-5.74204 -34.94844,0 0,5.74204 34.94844,0 m 0,13.00819 0,-5.77748 -34.94844,0 0,5.77748 34.94844,0 m 0,12.76007 0,-5.77747 -34.94844,0 0,5.77747 34.94844,0 m 0,12.58285 0,-5.77747 -34.94844,0 0,5.77747 34.94844,0 m 0,12.76008 0,-5.81293 -34.94844,0 0,5.81293 34.94844,0 m 0,12.86641 0,-5.77747 -34.94844,0 0,5.77747 34.94844,0 m -60.96481,9.9245 c 0,0 6.30915,-22.75546 -26.08726,-36.89789 -32.36097,-14.14241 -43.06525,-12.76007 -43.06525,-12.76007 0,0 10.27895,33.21165 28.95827,43.34881 18.64389,10.17263 40.19424,6.30915 40.19424,6.30915 m 85.74062,0 c 0,0 -6.30915,-22.75546 26.05182,-36.89789 32.39641,-14.14241 43.06526,-12.76007 43.06526,-12.76007 0,0 -10.27895,33.21165 -28.92284,43.34881 -18.67934,10.17263 -40.19424,6.30915 -40.19424,6.30915",
            "utgar": "M 499.52857,1.83e-4 68.344356,250.80655 l 0,499.06073 431.574104,250.13292 431.82222,-250.13292 0,-499.06073 L 499.52857,1.83e-4 m -0.67345,86.414063 -357.24666,206.642334 0,413.74543 357.24666,205.75623 358.06189,-205.75623 0,-413.74543 L 498.85512,86.414246 M 630.88646,535.00179 c 0,0 18.36032,19.49455 45.86537,19.49455 27.5405,0 55.61267,-20.23889 55.61267,-72.83876 0,0 -9.71183,-7.12438 -9.71183,-16.12732 0,-21.33768 7.58515,-18.39577 7.58515,-31.29763 0,-12.90185 -20.09712,-77.12757 -40.51324,-102.93127 -20.38067,-25.80371 -59.72423,-61.21292 -93.32577,-76.52501 -33.60154,-15.31209 -65.11183,-23.71247 -84.92539,-23.71247 -19.81356,0 -51.92642,-2.09124 -51.92642,63.0206 0,65.11182 32.99897,161.7694 63.62316,204.65742 30.62417,42.92348 69.01074,87.65463 116.75469,118.56236 0,0 3.29635,48.63008 46.82238,48.63008 43.49059,0 51.89098,-48.91363 51.89098,-48.91363 0,0 -2.97735,83.11772 -82.51516,83.11772 -59.44068,0 -71.73998,-39.91069 -71.73998,-39.91069 0,0 -50.11874,0.28356 -50.11874,52.20997 0,29.10007 20.13257,45.33372 45.61727,45.33372 37.81945,0 60.6458,-27.93039 60.6458,-27.93039 0,0 -18.92744,54.62021 -73.54765,54.62021 -31.5103,0 -41.71837,-9.88905 -46.21983,-12.90185 -4.50147,-2.97735 -6.30915,-3.29635 -9.88906,-1.48867 -3.61535,1.80767 -14.70953,1.48867 -15.91465,-6.02559 -1.20511,-7.47883 -0.60256,-17.08433 -11.41318,-17.08433 -10.77517,0 -34.20408,14.70953 -45.29827,30.02163 0,0 3.57991,33.88509 43.20704,33.88509 31.8293,0 50.11873,-9.88907 50.11873,-9.88907 0,0 -20.41611,35.40922 -60.92936,35.40922 -40.51324,0 -75.03632,-41.1158 -75.03632,-41.1158 0,0 -14.99309,0.28356 -20.38068,-12.6183 -5.42304,-12.90185 -1.80767,-29.70262 -8.11682,-51.60742 -6.30915,-21.9048 -18.892,-59.72423 -32.99898,-75.92245 -14.10697,-16.1982 -41.1158,-32.71541 -41.1158,-32.71541 0,0 -3.89891,21.62124 -3.89891,35.40921 0,13.82342 10.77517,39.30812 26.40627,52.52898 0,0 -63.3396,-27.93039 -65.43083,-102.04516 0,0 -5.99015,-2.41024 -13.82342,-6.91172 -7.79782,-4.50146 -14.10697,-7.79781 -14.10697,-50.11873 0,-42.32092 5.70659,-107.7163 26.12271,-157.55149 20.41611,-49.79974 41.71835,-93.32578 79.2188,-127.84886 37.53589,-34.52309 86.73306,-72.30709 118.27881,-89.1433 31.51029,-16.80078 61.81548,-32.11287 61.81548,-32.11287 0,0 42.92347,21.62124 77.41112,42.92348 34.52309,21.30224 87.05207,55.22277 113.74189,82.2316 26.72528,27.00882 63.94216,69.9323 75.6389,109.24042 11.69673,39.30813 15.59564,70.21587 14.39053,105.66052 0,0 5.70658,11.98028 1.52411,17.40332 -4.21791,5.38759 -10.81061,3.89891 -14.10696,12.29929 -3.29637,8.40039 -24.31504,60.32681 -79.25425,60.32681 -45.90083,0 -66.03339,-39.69801 -66.03339,-39.69801 M 500.27291,268.74154 c 0,0 60.29135,-4.64325 107.7163,23.71247 0,0 -27.82405,72.41343 10.03084,117.74714 0,0 -15.70198,-64.40292 14.17786,-100.23747 0,0 76.80856,48.45283 76.80856,120.61816 0,49.72884 -35.30287,68.01829 -35.30287,68.01829 0,0 19.56545,-43.52604 -1.80768,-62.6307 0,0 -30.1634,24.74036 -59.51157,24.74036 -29.38362,0 -64.9346,-34.27498 -85.06717,-75.249 C 507.22006,344.48676 500.27291,328.005 500.27291,268.74154",
            "valkrill": "m 500.00729,0 -433.01232,249.98815 0,500.01276 L 500.00729,1000 933.00503,750.00091 l 0,-500.01276 L 500.00729,0 Z m 0,88.518325 356.3414,205.730805 0,411.4908 -356.3414,205.71986 -356.34141,-205.71986 0,-411.4908 356.34141,-205.730805 z m 6.00576,153.611665 c -157.84484,0 -285.18055,63.32165 -296.93295,131.27331 -12.50261,63.32537 7.88818,215.71957 10.18827,281.30778 34.06493,7.46644 74.64257,17.80139 108.61044,28.8473 44.66547,14.52463 50.45329,17.10047 49.98596,48.5456 -0.9374,63.07502 1.44515,56.10361 39.0684,80.95188 -0.0401,-40.66643 -3.18854,-56.76113 11.7526,-56.76113 20.50424,0 4.80373,40.762 15.58507,57.98635 6.06375,10.06458 19.88678,15.7098 40.07846,24.3366 3.12561,-26.56791 -8.02866,-82.94662 15.41367,-95.57425 21.70961,8.59013 13.63785,59.71312 13.63785,99.59633 16.81594,-7.75165 31.06834,-15.53955 37.13211,-24.9164 8.97539,-15.78876 -3.92828,-75.0759 13.90038,-75.10294 17.91584,-0.0272 10.25473,31.13259 11.15824,72.30972 38.26001,-22.80426 33.9271,-23.84586 35.13383,-74.26422 0.61837,-25.83524 4.07151,-35.97422 39.16686,-49.2275 29.89772,-11.29043 82.44055,-24.81313 130.43098,-35.163 6.25265,-96.89486 16.37594,-206.29183 8.56194,-284.43282 C 781.07106,293.70165 663.85783,242.12999 506.01305,242.12999 Z M 289.53242,355.87101 c -0.35105,72.34581 -13.75642,79.54994 55.51038,127.99513 65.10478,45.53427 122.35568,59.62961 115.14857,65.0751 -10.04111,7.58677 -61.44605,48.95493 -69.01329,55.01082 -3.79968,3.0408 -15.78727,-7.77743 -30.07619,-16.33259 -7.84272,-4.85465 -11.27618,4.85546 -13.34976,15.18758 -2.62706,13.08995 -8.33053,19.39522 -14.18846,16.77382 -6.83687,-2.94635 -4.08464,-13.38413 2.13319,-23.07494 6.21784,-9.69082 13.94375,-19.61394 11.18011,-24.46423 -4.91041,-8.61793 -4.70425,-17.13914 -5.3895,-30.76537 -0.89241,-17.74596 -82.91541,-69.27345 -76.8277,-119.25451 2.94095,-24.14568 11.65591,-34.76505 24.87265,-66.15081 z m 412.58107,2.91355 c 14.58265,30.81914 28.97786,53.9665 28.69051,76.48858 -0.64758,50.74962 -66.25756,87.02945 -69.25396,103.04227 -2.01813,10.78505 0.36923,19.07265 -5.88177,32.38803 -3.22355,6.52842 4.16398,15.81521 11.20198,23.66566 7.03803,7.85044 9.45454,18.89956 3.23809,22.08309 -4.91303,2.51603 -11.03586,-0.68104 -15.31159,-15.26782 -3.14253,-10.72088 -7.81889,-21.32161 -15.62151,-17.49581 -10.37868,5.0889 -24.66572,25.59046 -29.20103,21.82784 -10.74737,-8.9163 -56.83096,-46.24019 -69.77176,-56.69549 -7.29382,-5.89297 56.5988,-23.77605 130.67164,-75.02271 43.33525,-29.98111 34.52641,-35.34517 31.2394,-115.01364 z M 487.57278,649.39814 c -10.00203,35.6323 1.50249,48.31353 -4.18614,53.01254 -7.81406,6.25125 -22.69206,-8.6294 -22.69206,-18.00632 0,-9.37696 26.8782,-35.00622 26.8782,-35.00622 z m 23.20621,0.81317 c 11.53484,9.60175 25.99269,24.31801 24.17981,36.57056 -1.56148,12.50256 -18.75377,21.06743 -22.69204,15.62881 -3.43817,-3.93834 5.59558,-17.60253 -1.48777,-52.19937 z",
            "vydar": "m 68.421068,250.71787 0,499.20256 431.578952,250.07977 431.57895,-250.07977 0,-499.20256 L 499.68105,1.69e-4 68.421068,250.71787 Z M 487.87881,640.51054 c 0,0 -133.65231,-16.26795 -133.65231,-190.7496 l 0,0 c 0,-13.39713 0.31897,-15.31101 3.18978,-17.54386 l 0,0 c 2.87082,-2.23286 37.32058,-18.5008 37.32058,-36.68262 l 0,0 c 0,-17.86284 -5.74163,-37.95853 -7.97448,-43.38118 l 0,0 c -1.91387,-5.74162 -1.27592,-36.04466 4.14673,-50.07975 l 0,0 c 5.42265,-14.03509 29.66507,-61.563 84.21052,-84.5295 l 0,0 c 54.54547,-22.64752 91.86604,-26.1563 126.63478,-26.1563 l 0,0 c 73.68421,0 140.66986,35.72568 140.66986,35.72568 l 0,0 c 63.47688,36.68261 114.51355,66.02871 114.51355,66.02871 l 0,0 0,413.71611 c 0,0 -77.19297,44.33811 -160.12759,91.86603 l 0,0 c 0,0 46.88995,-83.57257 52.3126,-158.85168 l 0,0 c 0,0 1.5949,-6.0606 6.69857,-12.44019 l 0,0 c 5.42265,-6.69856 13.39712,-23.28548 1.27591,-39.23445 l 0,0 c -11.80223,-15.94896 -20.73365,-25.51833 -20.73365,-25.51833 l 0,0 c 0,0 -14.99203,-108.45297 -78.78788,-156.93782 l 0,0 c -63.79585,-48.16586 -97.92663,-53.26953 -160.1276,-48.16586 l 0,0 c 0,0 77.19299,11.16428 105.90113,62.51994 l 0,0 c 28.70814,51.67464 33.49282,88.35725 33.17384,140.0319 l 0,0 c 0,0 -4.14673,7.6555 -13.07815,11.48325 l 0,0 c -8.93142,3.50877 -26.79425,14.67305 -26.79425,34.13079 l 0,0 c 0,14.67303 4.78468,26.79425 6.0606,34.13077 l 0,0 c 1.5949,7.6555 2.87081,13.39714 2.87081,23.28549 l 0,0 c 0,46.57097 -58.69219,141.30782 -208.29346,141.30782 l 0,0 c -93.46093,0 -168.42105,-47.52791 -168.42105,-47.52791 l 0,0 c -50.39873,-28.70814 -87.08136,-50.07975 -87.08136,-50.07975 l 0,0 0,-413.71611 c 0,0 69.53749,-40.19139 147.04946,-85.16746 l 0,0 c 0,0 -18.5008,33.17383 -29.3461,69.85645 l 0,0 c -11.16428,36.68262 -15.94897,62.51993 -16.9059,70.17545 l 0,0 c -0.95694,7.6555 0,11.16426 -7.6555,21.3716 l 0,0 c -7.6555,9.88836 -8.93142,22.32855 -4.78469,32.21691 l 0,0 c 4.14672,9.56937 16.26794,23.60446 19.45774,27.43221 l 0,0 c 3.18978,3.50878 6.0606,5.74163 6.0606,5.74163 l 0,0 c 0,0 2.87081,53.9075 32.53588,97.60766 l 0,0 c 28.46004,42.24704 69.82103,108.4884 184.58268,108.52384 l 0,0 c 4.92646,0 9.9238,-0.14178 15.09835,-0.38987"
        }

        var generalName = document.getElementById('generalName').value;
        var path = new Path2D(symbols[generalName]);
 
    
        textCtx.save();
        textCtx.fillStyle = '#d5d8d7';
        textCtx.translate(434, 149);
        textCtx.scale(117 / 1000, 117 / 1000);
        textCtx.clearRect(0, 0, 1000, 1000);
        textCtx.fill(path, "evenodd");
        textCtx.restore();
    }
    
    function drawAttrs() {
    
        var attrSpec = {
            fontFamily: 'ScapeCondensedBold',
            fontSize: 29.2,
            baseline: 0.9,
            //approx baseline location
            fontColor: '#fff',
            alignment: 'right',
            letterSpacing: 0,
            lineHeight: 1.0,
            spacingBefore: 0
        };
        var sizeSpec = JSON.parse(JSON.stringify(attrSpec));
        sizeSpec.fontSize = 41.7;
    
        var species = cleanString(document.getElementById('species').value.toUpperCase());
        var uniqueness = cleanString(document.getElementById('uniqueness').value.toUpperCase());
        var uclass = cleanString(document.getElementById('class').value.toUpperCase());
        var personality = cleanString(document.getElementById('personality').value.toUpperCase());
        var size = cleanString(document.getElementById('size').value.toUpperCase());
    
        textCtx.clearRect(50, 600, 250, 300);
    
        //attributes
        fitText(textCtx, species, 290, 644, attrSpec.fontFamily, attrSpec.fontSize, attrSpec.fontColor, attrSpec.alignment, 119);
        fitText(textCtx, uniqueness, 290, 695, attrSpec.fontFamily, attrSpec.fontSize, attrSpec.fontColor, attrSpec.alignment, 187);
        fitText(textCtx, uclass, 290, 745, attrSpec.fontFamily, attrSpec.fontSize, attrSpec.fontColor, attrSpec.alignment, 214);
        fitText(textCtx, personality, 290, 796, attrSpec.fontFamily, attrSpec.fontSize, attrSpec.fontColor, attrSpec.alignment, 214);
        fitText(textCtx, size, 290, 865, sizeSpec.fontFamily, sizeSpec.fontSize, sizeSpec.fontColor, sizeSpec.alignment, 181);
    }
    
    function drawSpecs() {
    
        //TODO: need to textSpec-ify this for future template compatibility
        var tmpSpec = {
            fontFamily: 'ScapeCondensedBold',
            fontSize: 29.2,
            baseline: 0.9,
            //approx baseline location
            fontColor: '#fff',
            alignment: 'right',
            letterSpacing: 0,
            lineHeight: 1.0,
            spacingBefore: 0
        };
    
        var life = cleanString(document.getElementById('life').value);
        var move = cleanString(document.getElementById('move').value);
        var range = cleanString(document.getElementById('range').value);
        var attack = cleanString(document.getElementById('attack').value);
        var defense = cleanString(document.getElementById('defense').value);
        var points = cleanString(document.getElementById('points').value);
    
        textCtx.clearRect(775, 725, 400, 600);
    
        //mrad labels
        drawText(textCtx, 'MOVE', 800 + 128, 841 + 0 * 97 + 57, 'ScapeBold', 41.7, '#d5d8d7', 'center', 4.17);
        drawText(textCtx, 'RANGE', 800 + 128, 841 + 1 * 97 + 57, 'ScapeBold', 41.7, '#d5d8d7', 'center', 4.17);
        drawText(textCtx, 'ATTACK', 800 + 128, 841 + 2 * 97 + 57, 'ScapeBold', 41.7, '#d5d8d7', 'center', 4.17);
        drawText(textCtx, 'DEFENSE', 800 + 128, 841 + 3 * 97 + 57, 'ScapeBold', 41.7, '#d5d8d7', 'center', 4.17);
    
        //mrad values
        drawText(textCtx, move, 800 + 288, 841 + 0 * 97 + 50, 'ScapeBold', 50, '#d5d8d7', 'center', 0);
        drawText(textCtx, range, 800 + 288, 841 + 1 * 97 + 50, 'ScapeBold', 50, '#d5d8d7', 'center', 0);
        drawText(textCtx, attack, 800 + 288, 841 + 2 * 97 + 50, 'ScapeBold', 50, '#d5d8d7', 'center', 0);
        drawText(textCtx, defense, 800 + 288, 841 + 3 * 97 + 50, 'ScapeBold', 50, '#d5d8d7', 'center', 0);
    
        //mrad units
        var moveUnit = 'SPACES';
        var rangeUnit = 'SPACES';
        var attackUnit = 'DICE';
        var defenseUnit = 'DICE';
        if (move == '1')
            moveUnit = 'SPACE';
        if (range == '1')
            rangeUnit = 'SPACE';
        if (attack == '1')
            attackUnit = 'DIE';
        if (defense == '1')
            defenseUnit = 'DIE';
        drawText(textCtx, moveUnit, 800 + 288, 841 + 0 * 97 + 73, 'ScapeCondensedMedium', 25, '#d5d8d7', 'center', 0.417);
        drawText(textCtx, rangeUnit, 800 + 288, 841 + 1 * 97 + 73, 'ScapeCondensedMedium', 25, '#d5d8d7', 'center', 0.417);
        drawText(textCtx, attackUnit, 800 + 288, 841 + 2 * 97 + 73, 'ScapeCondensedMedium', 25, '#d5d8d7', 'center', 0.417);
        drawText(textCtx, defenseUnit, 800 + 288, 841 + 3 * 97 + 73, 'ScapeCondensedMedium', 25, '#d5d8d7', 'center', 0.417);
    
        //life. some of these specs were different for W9
        drawText(textCtx, life, 775 + 195, 716 + 70, 'ScapeBold', 58, '#fff', 'center', 0);
        drawText(textCtx, 'LIFE', 775 + 195, 716 + 105, 'ScapeCondensedBold', 29.2, '#d5d8d7', 'center', 0.416);
    
        //points. jandar, valkrill needs #121212 for color. W9 was white instead of off-white
    
        var generalName = cleanString(document.getElementById('generalName').value.toUpperCase());
        var textColor = '#d5d8d8';
        if (generalName == 'JANDAR' || generalName == 'VALKRILL') {
            textColor = '#121212';
        }
    
        drawText(textCtx, points, 775 + 194, 716 + 558, 'ScapeBold', 50, textColor, 'center', 0);
        drawText(textCtx, 'POINTS', 775 + 194, 716 + 589, 'ScapeCondensedMedium', 25, textColor, 'center', 0);
    
    }
    
    function drawPowers() {
    
        //todo cleanup redundant code
        var power1Heading = cleanString(document.getElementById('power1Heading').value.toUpperCase());
        var power1Text = cleanString(document.getElementById('power1Text').value);
        var power2Heading = cleanString(document.getElementById('power2Heading').value.toUpperCase());
        var power2Text = cleanString(document.getElementById('power2Text').value);
        var power3Heading = cleanString(document.getElementById('power3Heading').value.toUpperCase());
        var power3Text = cleanString(document.getElementById('power3Text').value);
        var power4Heading = cleanString(document.getElementById('power4Heading').value.toUpperCase());
        var power4Text = cleanString(document.getElementById('power4Text').value);
    
        for (var i = 0; i < spSpecs.length; i++) {
            var testProfile = spSpecs[i];
    
            textCtx.clearRect(325, 400, 450, 1000);
    
            var newTop = 0;
            if ((power1Heading + power1Text).length > 0) {
                newTop = drawParagraph(textCtx, power1Heading, testProfile.box.top + testProfile.box.topPad, testProfile.header, testProfile);
                if (!newTop)
                    continue;
                newTop = drawParagraph(textCtx, power1Text, newTop, testProfile.text, testProfile);
                if (!newTop)
                    continue;
            }
            if ((power2Heading + power2Text).length > 0) {
                newTop = drawParagraph(textCtx, power2Heading, newTop, testProfile.header, testProfile);
                if (!newTop)
                    continue;
                newTop = drawParagraph(textCtx, power2Text, newTop, testProfile.text, testProfile);
                if (!newTop)
                    continue;
            }
            if ((power3Heading + power3Text).length > 0) {
                newTop = drawParagraph(textCtx, power3Heading, newTop, testProfile.header, testProfile);
                if (!newTop)
                    continue;
                newTop = drawParagraph(textCtx, power3Text, newTop, testProfile.text, testProfile);
                if (!newTop)
                    continue;
            }
            if ((power4Heading + power4Text).length > 0) {
                newTop = drawParagraph(textCtx, power4Heading, newTop, testProfile.header, testProfile);
                if (!newTop)
                    continue;
                newTop = drawParagraph(textCtx, power4Text, newTop, testProfile.text, testProfile);
            }
            if (!newTop) {
                continue;
            } else {
                //            console.log(i);
                break;
            }
        }
    
    }
    
    function drawCard() {


        var startAll = performance.now();
    
        drawTitle(true);
        drawAttrs();
        drawSpecs();
    
        //    var startPowers = performance.now();
        drawPowers();
    
        //    var endAll = performance.now();
        //    console.log ('total time: ' + (endAll - startAll) + '   special powers: ' + (endAll - startPowers));
    
        textCtx.save();
        textCtx.font = "20px ScapeCondensedLight";
        textCtx.textAlign = "center";
        textCtx.textBaseline = "alphabetic";
        textCtx.letterSpacing = 0;
        textCtx.fillStyle = "#666";
        textCtx.origFillText('HEROSCAPE and all related characters are trademarks of Hasbro. © 2006 Hasbro. All Rights Reserved.', 750, 1495)
        textCtx.restore();

        
    
        //    var a = '1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 ';
        //    var a ='. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . ';
        //    var newTop = drawParagraph(textCtx, a+a+a+a+a+a, testProfile.box.top + testProfile.box.topPad, testProfile.text, testProfile);
    
    }
    
    function togglePowersEditor() {
        var dialog = document.getElementById('x2cc-powers-box');
        var functions = document.getElementById('functions');
    
        if (dialog.style.display == 'block') {
            dialog.style.display = 'none';
            functions.style.display = 'block';
        } else {
            dialog.style.display = 'block';
            functions.style.display = 'none';
        }
    }

    function toggleMediaEditor() {
        var dialog = document.getElementById('media');

        var inputForm = document.getElementById('inputForm');
        var functions = document.getElementById('functions');
        var input_layer = document.getElementById('input-layer');

        if (dialog.style.display == 'block') {
            dialog.style.display = 'none';
            inputForm.style.display = 'block';
            functions.style.display = 'block';
            input_layer.style.zIndex = 0;
        } else {
            dialog.style.display = 'block';
            inputForm.style.display = 'none';
            functions.style.display = 'none';
            input_layer.style.zIndex = 6;
        }
    }
    
    function renderCard() {
        var textLayer = document.getElementById('text-layer');
        var bgLayer = document.getElementById('background-layer');
        var imageLayer = document.getElementById("image-layer");
        var fogLayer = document.getElementById("fog-layer");
    
        var canvas = document.createElement('canvas');
        canvas.width = 1500;
        canvas.height = 1500;
        var ctx = canvas.getContext('2d');
    
        ctx.drawImage(fogLayer, 0, 0);
        ctx.drawImage(imageLayer, 0, 0);
        ctx.drawImage(bgLayer, 0, 0);
        ctx.drawImage(textLayer, 0, 0);
        return canvas;
    }
    
    function previewCard() {
    
        document.getElementById('renderImg').src = renderCard().toDataURL('image/jpeg', 1.0);
    
    }
    
    function saveCard() {
    
        var filename = document.getElementById('cardName').value.toTitleCase().replace(/[^0-9a-z ]/gi, '').replace(' ', '-');
        var card = renderCard();
        card.toBlobHD(function(blob) {
            saveAs(blob, filename + '.jpg');
        }, "image/jpeg");
    }

    /*document.getElementById('save-card-button').addEventListener('click', async () => {
        // Get the filename from the input and format it
        var filename = document.getElementById('cardName').value.toTitleCase().replace(/[^0-9a-z ]/gi, '').replace(/ /g, '-');
    
        // Render the card and get the Blob
        renderCard().toBlobHD(async function(blob) {
            // Save the Blob using the new technique
            await saveBlob(blob, 'image/jpeg', filename + '.jpg');
        }, "image/jpeg");
    });*/
    
    async function saveBlob(blob, fileType, suggestedName) {
        try {
            downloadBlob(blob);
    
            console.log('File saved successfully.');
        } catch (err) {
            console.error('Error saving file:', err);
        }
    }
    
    async function downloadBlob(inputblob) {
        const downloadelem = document.createElement("a");
        const url = URL.createObjectURL(inputblob);
        document.body.appendChild(downloadelem);
        downloadelem.src = url;
        downloadelem.click();
        downloadelem.remove();
        window.URL.revokeObjectURL(url);
    }

    
    //TODO: verify that the old waitforwebfonts stuff is no longer needed in ie11 on windows 7
    
    //based loosely on answer in  SO 4383226
    function preloadFonts(list) {
        var list = (typeof list != "object") ? [list] : list;
        var loadedFonts = 0;
        var nextAction = function() {};
    
        //create a large off-screen span using characters whose widths tend to change from font-to-font
        var node = document.createElement('span');
        node.innerHTML = 'giItT1WQy@!-/#';
        node.style.position = 'absolute';
        node.style.left = '-10000px';
        node.style.top = '-10000px';
        node.style.fontSize = '300px';
        node.style.fontFamily = 'sans-serif';
        node.style.fontVariant = 'normal';
        node.style.fontStyle = 'normal';
        node.style.fontWeight = 'normal';
        node.style.letterSpacing = '0';
        document.body.appendChild(node);
    
        //save width of of span using sans-serif
        var width = node.offsetWidth;
    
        var totalFonts = list.length;
    
        //no onload available for fonts, so this is our polling function
        function checkFonts() {
            loadedFonts = 0;
            for (var i = 0; i < totalFonts; i++) {
                node.style.fontFamily = list[i] + ', sans-serif';
                //change font with sans-serif as fallback
                if (node.offsetWidth != width)
                    loadedFonts++;
                //compare new width with old to see if webfont is loaded
            }
            if (loadedFonts != totalFonts) {
                setTimeout(checkFonts, 50);
                //try again in a little bit
            } else {
                nextAction();
                //success! do 'callback''
            }
        }
        setTimeout(checkFonts, 0);
        //finish up with this function (so we can correctly set nextAction), then check to see if they are loaded
    
        return {
            //return object with then() method
            then: function(f) {
                nextAction = f || nextAction
                //use caller's callback, if provided
            }
        }
    }

    function triggerFilePicker() {
        document.getElementById('fileInput').click();
    }


    function loadTheme(event) {
        const file = event.target.files[0];
        
        if (!file) {
            console.error('No file selected.');
            return;
        }

        // Check if the selected file is a JSON file
        if (file.type !== 'application/json') {
            console.error('Selected file is not a JSON file.');
            alert('Please select a valid JSON file.');
            return;
        }

        const reader = new FileReader();

        reader.onload = function(e) {
            try {
                const json = JSON.parse(e.target.result);
                console.log('Loaded JSON:', json);
                
                // Extract values from the JSON object
                handleJSON(json);
            } catch (err) {
                console.error('Error parsing JSON:', err);
                alert('The file contains invalid JSON.');
            }
        };

        reader.onerror = function() {
            console.error('Error reading the file:', reader.error);
            alert('Error reading the file.');
        };

        // Read the file as text
        reader.readAsText(file);
    }

    function handleJSON(json) {
        // Extract and log values from the JSON object
        const primaryHue = json.primary_hue;
        const primarySaturation = json.primary_sat;
        const primaryValue = json.primary_val;

        const secondaryHue = json.secondary_hue;
        const secondarySaturation = json.secondary_sat;
        const secondaryValue = json.secondary_val;

        const backgroundHue = json.background_hue;
        const backgroundSaturation = json.background_sat;
        const backgroundValue = json.background_val;
        const backgroundTheme = json.background_theme;

        primaryHueSelector.value = primaryHue;
        primarySatSelector.value = primarySaturation;
        primaryValSelector.value = primaryValue;

        secondaryHueSelector.value = secondaryHue;
        secondarySatSelector.value = secondarySaturation;
        secondaryValSelector.value = secondaryValue;

        backgroundHueSelector.value = backgroundHue;
        backgroundSatSelector.value = backgroundSaturation;
        backgroundValSelector.value = backgroundValue;

        primaryHueNumber.value = primaryHue;
        primarySatNumber.value = primarySaturation;
        primaryValNumber.value = primaryValue;

        secondaryHueNumber.value = secondaryHue;
        secondarySatNumber.value = secondarySaturation;
        secondaryValNumber.value = secondaryValue;

        backgroundHueNumber.value = backgroundHue;
        backgroundSatNumber.value = backgroundSaturation;
        backgroundValNumber.value = backgroundValue;

        document.getElementById("background-type").value = backgroundTheme;

        changeTemplate();

        document.getElementById("themeLoader").value = "";
        // Implement further processing as needed, e.g., applying these values to a theme
        //applyTheme(primaryHue, primarySaturation, primaryValue, secondaryHue, secondarySaturation, secondaryValue, backgroundHue, backgroundSaturation, backgroundValue, backgroundTheme);
    }




    function handleFileChange(event) {
        const file = event.target.files[0];
        if (file) {
            console.log('Selected file:', file.name);
            // You can add more logic to handle the selected file here
        }
    }
    
    //array holding our image assets. e.g., images["aquilla"] contains a loaded Image()
    var images = [];
    var backgrounds = [
        {name: "branches", url: "assets/aquilla.png"},
        {name: "desert", url:"assets/einar.png"},
        {name: "mountains", url:"assets/jandar.png"},
        {name: "forest", url:"assets/ullar.png"},
        {name: "volcano", url:"assets/utgar.png"},
        {name: "dust", url:"assets/valkrill.png"},
        {name: "canyon", url:"assets/vydar.png"},
        {name: "smoke", url:"assets/custom.png"}
    ]

    var background_images = [];

    for (var i = 0, l = backgrounds.length; i < l; i++) {
        var name = backgrounds[i].name;
        background_images[name] = new Image();
        background_images[name].src = backgrounds[i].url;
    }
    //preloads passed list of image names/URLs into images[] (a global)
    //enhanced from http://www.javascriptkit.com/javatutors/preloadimagesplus.shtml
    function preloadImages(list) {
        var list = (typeof list != "object") ? [list] : list;
        console.log(list);
        var loadedImages = 0;
        var nextAction = function() {};
        function imageLoadEvent() {
            loadedImages++;
            if (loadedImages == list.length) {
                nextAction();
                //call nextAction
            }
        }
        for (var i = 0, l = list.length; i < l; i++) {
            var name = list[i].name;
            images[name] = new Image();
            images[name].src = list[i].url;
            images[name].onload = imageLoadEvent;
            images[name].onerror = imageLoadEvent;
        }

        

        return {
            //return object with then() method
            then: function(f) {
                nextAction = f || nextAction
                //use caller's callback, if provided
            }
        }
    }
    
    function init() {
        var rootdir = "assets/"
        var templateImageList = [{
            name: "blank",
            url: rootdir+"blank.jpg"
        }, {
            name: "mask",
            url: rootdir+"mask.png"
        }, {
            name: "aquilla",
            url: rootdir+"aquilla.png"
        }, {
            name: "custom",
            url: rootdir+"custom.png"
        }, {
            name: "einar",
            url: rootdir+"einar.png"
        }, {
            name: "jandar",
            url: rootdir+"jandar.png"
        }, {
            name: "ullar",
            url: rootdir+"ullar.png"
        }, {
            name: "utgar",
            url: rootdir+"utgar.png"
        }, {
            name: "valkrill",
            url: rootdir+"valkrill.png"
        }, {
            name: "vydar",
            url: rootdir+"vydar.png"
        }]
    
        preloadImages(templateImageList).then(function() {
            var fontList = ['ScapeBold', 'ScapeCondensedLight', 'ScapeCondensed', 'ScapeCondensedMedium', 'ScapeCondensedBold', 'ScapeCondensedHeavy'];
    
            preloadFonts(fontList).then(function() {
                //TODO: remove the "loading images" dialog and draw the card
                drawCard();
                setTimeout(drawCard, 1000);
                //win7/ie11 hack required scaper2 to be absent in the font loader and to do a later redraw
                changeTemplate();
            });
        });

        uploadImageManually("freeze-man.png");
    }
    
    function hsvToRgb(h, s, v) {
        var r, g, b, i, f, p, q, t;
        if (h > 1)
            h -= Math.floor(h);
        if (s > 1)
            s = 1;
        if (v > 1)
            v = 1;
        if (h < 0)
            h = 1 - (h - Math.ceil(h));
        if (s < 0)
            s = 0;
        if (v < 0)
            v = 0;
        i = Math.floor(h * 6);
        f = h * 6 - i;
        p = v * (1 - s);
        q = v * (1 - f * s);
        t = v * (1 - (1 - f) * s);
        switch (i % 6) {
        case 0:
            r = v,
            g = t,
            b = p;
            break;
        case 1:
            r = q,
            g = v,
            b = p;
            break;
        case 2:
            r = p,
            g = v,
            b = t;
            break;
        case 3:
            r = p,
            g = q,
            b = v;
            break;
        case 4:
            r = t,
            g = p,
            b = v;
            break;
        case 5:
            r = v,
            g = p,
            b = q;
            break;
        }
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }
    
    function rgbToHsv(r, g, b) {
        var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h, s = (max === 0 ? 0 : d / max), v = max / 255;
    
        switch (max) {
        case min:
            h = 0;
            break;
        case r:
            h = (g - b) + d * (g < b ? 6 : 0);
            h /= 6 * d;
            break;
        case g:
            h = (b - r) + d * 2;
            h /= 6 * d;
            break;
        case b:
            h = (r - g) + d * 4;
            h /= 6 * d;
            break;
        }
    
        return {
            h: h,
            s: s,
            v: v
        };
    }
    
    //adjust the blank image for the currently selected general
    //returns the image data
    function adjustBlank() {
    
        var templateColors = [{
            "aquilla": {
                "hue": 46 / 360,
                "sat": 75 / 100,
                "val": 77 / 100,
                "constantSat": false
            },
            "custom": {
                "hue": primaryHueSelector.value / 360,
                "sat": primarySatSelector.value / 100,
                "val": primaryValSelector.value / 100,
                "constantSat": false
            },
            "einar": {
                "hue": 310 / 360,
                "sat": 83 / 100,
                "val": 22 /*19*/
                / 100,
                "constantSat": false
            },
            "jandar": {
                "hue": 142 / 360,
                "sat": -2 /*1*/
                / 100,
                "val": 95 /*92*/
                / 100,
                "constantSat": true
            },
            "ullar": {
                "hue": 29 / 360,
                "sat": 68 / 100,
                "val": 40 / 100,
                "constantSat": false
            },
            "utgar": {
                "hue": 25 / 360,
                "sat": 47 / 100,
                "val": 14 / 100,
                "constantSat": false
            },
            "vydar": {
                "hue": 15 / 360,
                "sat": 7 / 100,
                "val": 39 / 100,
                "constantSat": false
            },
            "valkrill": {
                "hue": 28 / 360,
                "sat": 57 / 100,
                "val": 54 /*48*/
                / 100,
                "constantSat": false
            }
        }, {
            "aquilla": {
                "hue": 224 / 360,
                "sat": 100 / 100,
                "val": 8 / 100,
                "invert": true
            },
            "custom": {
                "hue": secondaryHueSelector.value / 360,
                "sat": secondarySatSelector.value / 100,
                "val": secondaryValSelector.value / 100,
                "invert": false
            },
            "einar": {
                "hue": 27 / 360,
                "sat": 71 / 100,
                "val": 61 / 100,
                "invert": false
            },
            "jandar": {
                "hue": 211 / 360,
                "sat": 67 / 100,
                "val": 67 / 100,
                "invert": false
            },
            "ullar": {
                "hue": 151 / 360,
                "sat": 100 / 100,
                "val": 27 / 100,
                "invert": true
            },
            "utgar": {
                "hue": 356 / 360,
                "sat": 77 / 100,
                "val": 46 / 100,
                "invert": false
            },
            "vydar": {
                "hue": 198 / 360,
                "sat": 39 / 100,
                "val": 59 / 100,
                "invert": false
            },
            "valkrill": {
                "hue": 41 / 360,
                "sat": 57 / 100,
                "val": 56 / 100,
                "invert": true
            }//        "valkrill": {"hue": 30/360, "sat":  99/100, "val": 31/100, "invert": true} //robbdaman's template, which is way too dark
        }];
        var generalName = document.getElementById('generalName').value;
    
        //working canvas
        var canvas = document.createElement('canvas');
        canvas.width = 1500;
        canvas.height = 1500;
        var ctx = canvas.getContext('2d');
        ctx.willReadFrequently = true;
    
        //get mask pixels
        ctx.drawImage(images["mask"], 0, 0);
        var maskPixels = ctx.getImageData(0, 0, 1500, 1500).data;
    
        //load mini background
        //ctx.drawImage(images[generalName], 0, 0);
        var bgPixels = ctx.getImageData(0, 0, 1500, 1500).data;
    
        //load card texture
        ctx.drawImage(images["blank"], 0, 0);
        var pixelData = ctx.getImageData(0, 0, 1500, 1500);
        var pixels = pixelData.data;
    
        //now we're going to work on modifying the underlying card
    
        //prepare pri(mary) and sec(ondary) color adjustment
        var pri = {
            hue: templateColors[0][generalName].hue,
            sat: templateColors[0][generalName].sat,
            valDiff: templateColors[0][generalName].val - templateColors[0]["vydar"].val
        }
    
        var sec = {
            hueDiff: templateColors[1][generalName].hue - templateColors[1]["vydar"].hue,
            satDiff: templateColors[1][generalName].sat - templateColors[1]["vydar"].sat,
            valDiff: templateColors[1][generalName].val - templateColors[1]["vydar"].val,
            val: templateColors[1][generalName].val,
            invert: templateColors[1][generalName].invert
        }
    
        for (var i = 0, l = pixels.length; i < l; i += 4) {
            switch (maskPixels[i + 2]) {
            case 0:
                //black--put miniature background here
                //pixels[i] = bgPixels[i];
                //pixels[i + 1] = bgPixels[i + 1];
                //pixels[i + 2] = bgPixels[i + 2];
                //pixels[i + 3] = bgPixels[i + 3];
                pixels[i+3] = 0;
                break;
            case 128:
                //purple--recolor primary color
                var val = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) / 255;
                //shortcut to only get the 'v' of hsv
                var rgb = hsvToRgb(pri.hue, pri.sat, val + pri.valDiff);
                pixels[i] = rgb.r;
                pixels[i + 1] = rgb.g;
                pixels[i + 2] = rgb.b;
                break;
            case 255:
                //blue--recolor inset area
                var hsv = rgbToHsv(pixels[i], pixels[i + 1], pixels[i + 2]);
    
                //now shift to the general's color
                hsv.h += sec.hueDiff;
                hsv.s += sec.satDiff;
                hsv.v += sec.valDiff;
    
                //check to see if we invert light-to-dark
                if (sec.invert) {
                    var overage = hsv.v - sec.val;
                    //amount this pixel is over average template value
                    if (overage > -0.05) {
                        //trying to avoid shadow
                        hsv.v -= 2 * overage;
                        //move it this much above or below the average
                    } else {
                        //now we have to determine if we are in the shadow area
                        var shadow = false;
                        //check 13 pixels up, 9 to right. if it is a border we are in shadow.
                        var j = i - (13 * 1500 - 9) * 4;
                        if (maskPixels[j + 2] == 128) {
                            shadow = true;
                        } else if (maskPixels[i + 2 + 4 * 4] != 64 && maskPixels[i + 2 + 20 * 4] == 64 & maskPixels[i + 2 + 20 * 1500 * 4] != 128) {
                            // special code to catch pixels at the top attribue pointy area
                            shadow = true;
                        } else if (maskPixels[i + 2 - 1500 * 9 * 4] == 128) {
                            // special code to catch some missed pixels at the right curvy side of attribue area
                            shadow = true;
                        }
    
                        if (shadow) {
                            hsv.v += 0.10;
                        } else {
                            hsv.v -= 2 * overage;
                            //handle normally
                        }
                    }
                }
    
                var rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
                pixels[i] = rgb.r;
                pixels[i + 1] = rgb.g;
                pixels[i + 2] = rgb.b;
                break;
                //also in mask is:
                // 64 (green)--which means to not modify this area, and 
                /*            default:	//error in mask. 
                    out[i] = 255;	//set output to solid red to make problem obvious.
                    out[i + 1] = 0;
                    out[i + 2] = 0;
                    out[i + 3] = 255; //not transparent
                break;*/
            }
        }
        return pixelData;
    }

    function adjustFog() {
        var templateColors = [{
            "aquilla": {
                "hue": 46 / 360,
                "sat": 75 / 100,
                "val": 77 / 100,
                "constantSat": false
            },
            "custom": {
                "hue": primaryHueSelector.value / 360,
                "sat": primarySatSelector.value / 100,
                "val": primaryValSelector.value / 100,
                "constantSat": false
            },
            "einar": {
                "hue": 310 / 360,
                "sat": 83 / 100,
                "val": 22 /*19*/
                / 100,
                "constantSat": false
            },
            "jandar": {
                "hue": 142 / 360,
                "sat": -2 /*1*/
                / 100,
                "val": 95 /*92*/
                / 100,
                "constantSat": true
            },
            "ullar": {
                "hue": 29 / 360,
                "sat": 68 / 100,
                "val": 40 / 100,
                "constantSat": false
            },
            "utgar": {
                "hue": 25 / 360,
                "sat": 47 / 100,
                "val": 14 / 100,
                "constantSat": false
            },
            "vydar": {
                "hue": 15 / 360,
                "sat": 7 / 100,
                "val": 39 / 100,
                "constantSat": false
            },
            "valkrill": {
                "hue": 28 / 360,
                "sat": 57 / 100,
                "val": 54 /*48*/
                / 100,
                "constantSat": false
            }
        }, {
            "aquilla": {
                "hue": 224 / 360,
                "sat": 100 / 100,
                "val": 8 / 100,
                "invert": true
            },
            "custom": {
                "hue": secondaryHueSelector.value / 360,
                "sat": secondarySatSelector.value / 100,
                "val": secondaryValSelector.value / 100,
                "invert": false
            },
            "einar": {
                "hue": 27 / 360,
                "sat": 71 / 100,
                "val": 61 / 100,
                "invert": false
            },
            "jandar": {
                "hue": 211 / 360,
                "sat": 67 / 100,
                "val": 67 / 100,
                "invert": false
            },
            "ullar": {
                "hue": 151 / 360,
                "sat": 100 / 100,
                "val": 27 / 100,
                "invert": true
            },
            "utgar": {
                "hue": 356 / 360,
                "sat": 77 / 100,
                "val": 46 / 100,
                "invert": false
            },
            "vydar": {
                "hue": 198 / 360,
                "sat": 39 / 100,
                "val": 59 / 100,
                "invert": false
            },
            "valkrill": {
                "hue": 41 / 360,
                "sat": 57 / 100,
                "val": 56 / 100,
                "invert": true
            }//        "valkrill": {"hue": 30/360, "sat":  99/100, "val": 31/100, "invert": true} //robbdaman's template, which is way too dark
        }];
        var generalName = document.getElementById('generalName').value;
    
        //working canvas
        var canvas = document.createElement('canvas');
        canvas.width = 1500;
        canvas.height = 1500;
        var ctx = canvas.getContext('2d');
        ctx.willReadFrequently = true;
    
        //get mask pixels
        
        ctx.drawImage(images["mask"], 0, 0);
        var maskPixels = ctx.getImageData(0, 0, 1500, 1500).data;
    
        //load mini background
        // console.log("generalname " + generalName);
        // if (generalName == "custom") {
        //     console.log("drawing vydar");
        //     ctx.drawImage(images["vydar"], 0, 0);
        // } else {
        //     console.log("drawing generalName");
        //     ctx.drawImage(images[generalName], 0, 0);
        // }

        var background_name = document.getElementById("background-type").value;
        if (generalName == "custom") {

            ctx.drawImage(background_images[background_name], 0, 0);
        } else {
            ctx.drawImage(images[generalName], 0, 0);
        }
        // ctx.drawImage(images[generalName], 0, 0);
        var bgPixels = ctx.getImageData(0, 0, 1500, 1500);
        var pixels = bgPixels.data;
    
        //prepare pri(mary) and sec(ondary) color adjustment
        var pri = {
            hue: templateColors[0][generalName].hue,
            sat: templateColors[0][generalName].sat,
            valDiff: templateColors[0][generalName].val - templateColors[0]["vydar"].val
        }
    
        var sec = {
            hueDiff: templateColors[1][generalName].hue - templateColors[1]["vydar"].hue,
            satDiff: templateColors[1][generalName].sat - templateColors[1]["vydar"].sat,
            valDiff: templateColors[1][generalName].val - templateColors[1]["vydar"].val,
            val: templateColors[1][generalName].val,
            invert: templateColors[1][generalName].invert
        }
    

        for (var i = 0, l = pixels.length; i < l; i += 4) {
            switch (maskPixels[i + 2]) {
            case 0:
                //black--put miniature background here
                if (generalName == "custom") {
                    //blue--recolor inset area
                    var hsv = rgbToHsv(pixels[i], pixels[i + 1], pixels[i + 2]);
        
                    //now shift to the general's color
                    hsv.h += backgroundHueSelector.value / 360 - templateColors[1]["vydar"].hue;
                    hsv.s += backgroundSatSelector.value / 100 - templateColors[1]["vydar"].sat;
                    hsv.v += backgroundValSelector.value / 100 - templateColors[1]["vydar"].val;
        
                    //check to see if we invert light-to-dark
                    if (sec.invert) {
                        var overage = hsv.v - sec.val;
                        //amount this pixel is over average template value
                        if (overage > -0.05) {
                            //trying to avoid shadow
                            hsv.v -= 2 * overage;
                            //move it this much above or below the average
                        } else {
                            //now we have to determine if we are in the shadow area
                            var shadow = false;
                            //check 13 pixels up, 9 to right. if it is a border we are in shadow.
                            var j = i - (13 * 1500 - 9) * 4;
                            if (maskPixels[j + 2] == 128) {
                                shadow = true;
                            } else if (maskPixels[i + 2 + 4 * 4] != 64 && maskPixels[i + 2 + 20 * 4] == 64 & maskPixels[i + 2 + 20 * 1500 * 4] != 128) {
                                // special code to catch pixels at the top attribue pointy area
                                shadow = true;
                            } else if (maskPixels[i + 2 - 1500 * 9 * 4] == 128) {
                                // special code to catch some missed pixels at the right curvy side of attribue area
                                shadow = true;
                            }
        
                            if (shadow) {
                                hsv.v += 0.10;
                            } else {
                                hsv.v -= 2 * overage;
                                //handle normally
                            }
                        }
                    }
        
                    var rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
                    pixels[i] = rgb.r;
                    pixels[i + 1] = rgb.g;
                    pixels[i + 2] = rgb.b;
                }
                
                break;
            default:
                pixels[3] = 0;
            }
        }
        return bgPixels;
    }
    
    function changeTemplate() {
        //TODO: run through illustrator, reexport, and round to whole numbers. resulting size is about 1/2.5th of current size

    
        bgCtx.putImageData(adjustBlank(), 0, 0);
        
    
        var generalName = document.getElementById('generalName').value;
        fogCtx.putImageData(adjustFog(), 0, 0);
        //fogCtx.drawImage(images[generalName], 0, 0);
        //    bgCtx.save();
        //    bgCtx.fillStyle='#d5d8d7';
        //    bgCtx.translate(434,149);
        //    bgCtx.scale(117/1000,117/1000);
        //    bgCtx.fill(path,"evenodd");
        //    bgCtx.restore();
        //    drawTitle();
        //    drawSpecs(); //jandar and valkrill points area might need refreshing
    
        drawCard();

        if (generalName == "custom") {
            displayColorPicker();
        } else {
            disableColorPicker();
        }
    
    }

    function disableColorPicker() {
        var color_scheme = document.getElementById("color-picker");
        color_scheme.style.display = "none";
    }

    function displayColorPicker() {
        var color_scheme = document.getElementById("color-picker");
        color_scheme.style.display = "block";
    }
    
    init();
    
    /*
    
    //first stab at auto-scaling. more work to do
    var stage = document.getElementById('stage');
    var scaleX = window.innerWidth / 790;   //magic number of starting scale we use for canvases
    var scaleY = window.innerHeight / 790;
    
    var scaleToFit = Math.min(scaleX, scaleY);
    var scaleToCover = Math.max(scaleX, scaleY);
    
    stage.style.transformOrigin = "50% 0"; //scale from middle top
    stage.style.transform = "scale(" + scaleToFit + ")";
    
    
    FIXME? : in our pairwise comparison for kerning, the first character may start at a negative left side spacing, such as a smart apostrophe.
    for our manual adjustment, we may need to insert a space before the pair of characters and do calculations on that somehow?
    
    edit modes:
    - single line of text
    - two lines (text gets auto balanced between the two lines)
    - multi-line
    
    
    //clear the area
    
    
    TODO: add input field placeholders
    
    */
    
    /*    function downloadUri(uri, name) {
            var link = document.createElement("a");
            link.download = name;
            link.href = uri;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            delete link;
        }
    */
    


    function showPage(pageId) {
        // Hide all pages
        const pages = document.querySelectorAll('.page');
        pages.forEach(page => page.classList.remove('active'));
    
        // Show the selected page
        const selectedPage = document.getElementById(pageId);
        selectedPage.classList.add('active');
    }
        