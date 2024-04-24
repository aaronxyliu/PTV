(() => {
    /**
     * Check and set a global guard variable.
     * If this content script is injected into the same page again,
     * it will do nothing next time.
     */
    if (window.DetectorHasRun) {
        return;
    }
    window.DetectorHasRun = true;

    class Version {
        constructor(vlist, vstr = '') { 
            // vlist: all possible versions of a library   e.g. ['1.1.1, 1.1.2, 1.1.3]
            // vstr: the string displayed in UI            e.g. '1.1.1~1.1.3'
            if (vstr === null || vstr=== undefined || !vlist || !Array.isArray(vlist) || vstr == 'unknown' || vlist.length == 0 || !vlist[0]) {
                this.version_list = []
                this.version_string = 'unknown'
            }
            else {
                this.version_list = vlist   
                if (vstr == '')
                    this.version_string = vlist.join(', ')
                else
                    this.version_string = String(vstr)
            }   
        }

        isUnknown() {
            return this.version_list.length == 0
        }
    }

    class PropertyRecord {
        // The property path staring from `window`
        constructor() { 
            this.path_list = []
            this.ptr = window
            this.par_ptrs = []      // Parent pointers
        }

        copy(PR) {
            this.path_list = [...PR.path_list]
            this.par_ptrs = [...PR.par_ptrs]
            this.ptr = PR.ptr
        }

        grow(attribute_name) {  // PR is an instance of PropertyRecord
            if (this.ptr == undefined || this.ptr == null) return false

            this.path_list.push(attribute_name)
            this.par_ptrs.push(this.ptr)
            try{
                this.ptr = this.ptr[attribute_name]
            }
            catch{
                // Uncaught (in promise) DOMException: Failed to read a named property 
                // 'amplify' from 'Window': Blocked a frame with origin "https://ieeexplore.ieee.org" 
                // from accessing a cross-origin frame.
                return false
            }
            return true
        }

        growFrom(PR, attribute_name) {  // PR is an instance of PropertyRecord
            if (PR.ptr == undefined || PR.ptr == null) return false

            this.path_list = [...PR.path_list]
            this.par_ptrs = [...PR.par_ptrs]
            this.path_list.push(attribute_name)
            this.par_ptrs.push(PR.ptr)
            try{
                this.ptr = PR.ptr[attribute_name]
            }
            catch{
                // Uncaught (in promise) DOMException: Failed to read a named property 
                // 'amplify' from 'Window': Blocked a frame with origin "https://ieeexplore.ieee.org" 
                // from accessing a cross-origin frame.
                return false
            }
            return true
        }

        isWindow() {
            return (this.ptr == window) 
        }

        depth() {
            return this.path_list.length
        }

        hasCircle() {
            // Prevent loop in the object tree
            // Check whether v points to some parent variable
            if (this.path_list.length < 1 || this.ptr === undefined) 
                return false

            if (typeof this.ptr != 'object' && typeof this.ptr != 'function')
                return false

            for (let par_ptr of this.par_ptrs) {
                if (par_ptr == this.ptr) return true
            }
            return false
        }

        getAttr() {
            // Get attributes, i.e., child properties, and return as a string list
            if (this.ptr == undefined || this.ptr == null) {
                return [];
            }
            if (typeof (this.ptr) == 'object' || typeof (this.ptr) == 'function') {
                let vlist = Object.getOwnPropertyNames(this.ptr);
                vlist = vlist.filter(val => !["prototype"].includes(val));
                return vlist
            }    
            return [];
        }

        str() {
            if (this.path_list.length == 0)
                return 'window'
            
            return `window.${this.path_list.join('.')}`    
        }
        
    }

    class Library {
        constructor(libindex, detectLocationRecord) {
            this.index = libindex;                // the library index with respect to the libraries.json list
            // let pr = new PropertyRecord()
            // pr.copy(detectLocationRecord)
            this.detectLocationRecord = detectLocationRecord;       // PropertyRecord instance
            this.version = null             // <Version> instance
        }       

        locationPtr() {
            return this.detectLocationRecord.ptr
        }

        compareWithPTree(root) {
            // Compare the pTree from the detection location with the pTree. Return true if matches, false if not.
            const q = [root]
            const q2 = [new PropertyRecord()]
            while (q.length) {
                let vertex = q.shift()
                let pr = q2.shift()

                if (!this.checkComply(pr.ptr, vertex['d'])) return false

                for (let child of vertex['c']) {
                    q.push(child)
                    let new_pr = new PropertyRecord()
                    let success = new_pr.growFrom(pr, child['n'])
                    if (!success) return false
                    q2.push(new_pr)
                }
            }
            return true
        }

        isArraySetMap(v) {
            if (Array.isArray(v))   return true;
            if (Object.getPrototypeOf(v) === Set.prototype)   return true;
            if (Object.getPrototypeOf(v) === Map.prototype)   return true;
            return false;
        }

        checkComply(property, _dict) {
            // Check whether the property complies with the "d" field (_dict) in pTree
            if (_dict == undefined || _dict == null) return true
            if (_dict['t'] == undefined || _dict['t'] == null) return true

            if (property === undefined) {
                if (_dict['t'] == 1) return true;
                else return false;
            }
            if (property === null) {
                if (_dict['t'] == 2) return true;
                else return false;
            }
            if (this.isArraySetMap(property)) {
                if (_dict['t'] == 3) return true
                else return false;    // NEED CHANGE TO MD5 CHECK !!
            }
            if (typeof (property) == 'string') {
                if (_dict['t'] == 4 && _dict['v'] == property.slice(0, 24).replace(/<|>/g, '_')) return true;
                else return false;
            }
            if (typeof (property) == 'object') {
                if (_dict['t'] == 5) return true;
                else return false;
            }
            if (typeof (property) == 'function') {
                if (_dict['t'] == 6) return true;
                else return false;        
            }
            if (typeof (property) == 'number') {
                if (_dict['t'] == 7 && _dict['v'] == property.toFixed(2)) return true;
                else return false;
            }
            if (typeof (property) == 'boolean') {
                if (_dict['t'] == 8 && _dict['v'] == property) return true;
                else return false;
            }
            // Other condition
            if (_dict['t'] == typeof (property)) return true;
            else return false;
        }
    }

    class Libraries {
        constructor(libInfoList) {
            this.libs = []                      // a list of <Library> instances
            this.libInfoList = libInfoList      // a list read from libraries.json
            this.VerDe = new VersionDetermine()
        }

        addLib(libindex, detectLocationRecord) {
            let lib = new Library(libindex, detectLocationRecord)
            this.libs.push(lib)
        }

        findLibs(blacklist, depth_limit=3) {
            // Find potential libraries in the web context pTree
            const window_pr = new PropertyRecord()
            const q = [window_pr]
            while (q.length) {
                let pr = q.shift()
                if (pr.hasCircle())
                    continue
                
                let children = pr.getAttr();

                for (let i in this.libInfoList) {
                    let libInfo = this.libInfoList[i]
                    let lib_exist = false
                    let j = 0

                    if (!libInfo['feature1'] || libInfo['feature1'].length == 0 || libInfo['feature1'][0].length == 0) {
                        // The feature field is empty
                        continue
                    }
                        
                    while (true) {
                        j += 1
                        let featureName = `feature${j}`
                        if (! libInfo.hasOwnProperty(featureName)) {
                            break
                        }
                        
                        let properties = libInfo[featureName]
                        let feature_hold = true
                        for (let property of properties) {
                            let _pr = new PropertyRecord()
                            _pr.copy(pr)
                            for (let v of property) {  
                                if (!_pr.grow(v)){
                                    feature_hold = false
                                    break
                                }
                            }
                            if (_pr.ptr === undefined) feature_hold = false
            
                            if (!feature_hold) break
                        }
                        if (feature_hold) {
                            lib_exist = true
                            break
                        }
                    }

                    if (lib_exist) {
                        this.addLib(i, pr)
                    }
                }

                // Remove global variables in blacklist
                if (pr.isWindow()){
                    children = children.filter(val => !blacklist.includes(val));
                }
                    
    
                if (pr.depth() < depth_limit) {
                    for (let child_v of children) {
                        let new_pr = new PropertyRecord()
                        new_pr.growFrom(pr, child_v)
                        q.push(new_pr)
                    }
                }    
            }
        }

        async checkVersion(baseurl) {
            // Determine the version of each library
            for (let lib of this.libs) {
                // Step1: pre function checking
                const libInfo = this.libInfoList[lib.index]
                const v_func = libInfo['function']

                if (this.VerDe[v_func] != undefined && typeof this.VerDe[v_func] == 'function') {
                    // Invoke functions in <VersionDetermine> class
                    try {
                        lib.version = this.VerDe[v_func](lib.locationPtr())
                    }
                    catch (e)  {console.log(e)}
                }

                if (!lib.version instanceof Version) {
                    console.log(`Warning: function ${v_func} must return as a <Version> object.`)
                    continue
                }

                // Step2: pTree-based match checking
                if (!lib.version || lib.version.isUnknown()) {
                    console.log('start checking version through pTree comparison.')
                    lib.version = new Version([])
                    if (libInfo.hasOwnProperty('versionfile')) {

                        let file_exist = true
                        const response = await fetch(`${baseurl}/versions/${libInfo['versionfile']}`).catch(err => {
                            file_exist = false
                          })
                        if (file_exist && response.status == 200) {
                            // Version file exists
                            const version_dict = await response.json()
                            for (let [_, version_entry] of Object.entries(version_dict)) {
                                if (version_entry['compasison_result'] === undefined) {
                                    version_entry['compasison_result'] = lib.compareWithPTree(version_entry['pTree'])
                                }
                                if (version_entry['compasison_result'] == true) {
                                    // Ensure no supertree matching
                                    let have_S_match = false
                                    for (let S_index of version_entry['Sm']) {
                                        let S_entry = version_dict[S_index]
                                        if (S_entry['compasison_result'] === undefined) {
                                            S_entry['compasison_result'] = lib.compareWithPTree(S_entry['pTree'])
                                        }
                                        if (S_entry['compasison_result'] == true) {
                                            have_S_match = true
                                            break
                                        }
                                    }
                                    if (!have_S_match) {
                                        // Find the correct version
                                        lib.version = new Version(version_entry['version_list'], version_entry['version'])
                                        break
                                    }
                                }
                            }
                        }
                        else {
                            console.log(`${libInfo.libname} have an incorrect version file name given in the <libraries.json> file.`)
                        }
                    }
                    else {
                        console.log(`${libInfo.libname} does not have version file given in the <libraries.json> file.`)
                    }
                }

                // Step3: post function checking
                const post_v_func = libInfo['postfunction'] 
                if (this.VerDe[post_v_func] != undefined && lib.version.isUnknown()) {
                    try {
                        lib.version = this.VerDe[post_v_func](lib.locationPtr())
                    }
                    catch (e)  {console.log(e)}
                }

                if (!lib.version instanceof Version) {
                    console.log(`Warning: function ${post_v_func} must return as a <Version> object.`)
                }

            }

        }

        convertToJson() {
            const json_output = []
            for (let lib of this.libs) {
                json_output.push({
                    libname: this.libInfoList[lib.index]['libname'],
                    url: this.libInfoList[lib.index]['url'],
                    version: lib.version.version_string,
                    location: lib.detectLocationRecord.str()
                })
            }
            return json_output
        }
    }

    /**
     * Listen for messages from the content script.
     */
    window.addEventListener("message", async function (event) {
        if (event.data.type == 'detect') {
            const baseurl = event.data.url
            const response1 = await this.fetch(`${baseurl}/blacklist.json`)
            const blacklist = await response1.json()
            const response2 = await this.fetch(`${baseurl}/libraries.json`)
            const libInfoList = await response2.json()
            // console.log(blacklist)

            // Used to calculate spending time
            let start_time = Date.now()

            // Find all keywords in the web object tree
            let L = new Libraries(libInfoList)
            L.findLibs(blacklist)
            await L.checkVersion(baseurl)

            let end_time = Date.now()

            console.log(L.libs)

            this.window.postMessage({type: 'response', detected_libs: L.convertToJson()}, "*")

            // Only used for Selenium automation
            var detectTimeMeta = document.getElementById('lib-detect-time')
            detectTimeMeta.setAttribute("content", end_time - start_time);

            var detectResultMeta = document.getElementById('lib-detect-result')
            detectResultMeta.setAttribute("content", json.dumps(L.convertToJson()));
        }
    });

    class VersionDetermine {
        constructor() {
        }

        test_amplifyjs(root) {
            return new Version(['1.1.0', '1.1.1', '1.1.2'], '1.1.0~1.1.2')
        }

        test_backbonejs(root) {
            const backbone = root['Backbone']
            if (!backbone) return new Version([])
            const version = backbone['VERSION']
            if (version == '0.9.9' || version == '1.2.3') return new Version([])
            return new Version([version])
        }

        test_camanjs(root) {
            if (root['Caman']['version']) {
                const version = root['Caman']['version']['release']
                return new Version([version])
            }
            else 
                return new Version([])
        }

        test_corejs(root) {
            const shared = root['__core-js_shared__']
            const core = root.core
            if (core) {
                return new Version([core.version])
            }
            else if (shared) {
                const versions = shared.versions
                if (Array.isArray(versions)) {
                    const v_str = versions.map(it => `core-js-${ it.mode }@${ it.version }`).join('; ')
                    return new Version([v_str])
                }
                else {
                    return new Version([])
                }
            }
            return new Version([])
        }

        test_d3(root) {
            return new Version([root['d3']['version']])
        }

        test_dc(root) {
            const version = root['dc']['version']
            if (version == '4.0.0-beta.2')
                return new Version(['4.0.0-beta.2', '4.0.0-beta.3', '4.0.0-beta.4'], '4.0.0-beta.2~4.0.0-beta.4')
            if (version == '4.0.0-beta.5')
                return new Version(['4.0.0-beta.5', '4.0.1'])
            return new Version([version])
        }
    
        test_dojo(root) {
            if (root['dojo']['version'])
                return new Version([root['dojo']['version']['revision']])
            else
                return new Version([])
        }

        test_fabricjs(root) {
            return new Version([root['fabric']['version']])
        }        

        test_flot(root) {
            const plot = null
            if (root['$']) plot = root['$']['plot']
            if (root['jQuery']) plot = root['jQuery']['plot']
            if (plot && plot['version']) 
                return new Version([plot['version']])
            else
                return new Version([])
        }

        test_fusejs(root) {
            if (root['Fuse']['version'])    return new Version([root['Fuse']['version']])
            if (root['Fuse']['VERSION'])    return new Version([root['Fuse']['VERSION']])
            return new Version([])
        }

        test_hammerjs(root) {
            const version = root['Hammer']['VERSION']
            if (version == '2.0.4') return new Version(['2.0.4', '2.0.5'])
            if (version == '2.0.6') return new Version(['2.0.6', '2.0.7'])
            return new Version([version])
        }

        test_handlebarsjs(root) {
            const version = root['Handlebars']['VERSION']
            if (version == '3.0.1') return new Version(['3.0.1', '3.0.2', '3.0.3', '3.0.4','3.0.5', '3.0.6', '3.0.7'], '3.0.1~3.0.7')
            return new Version([version])
        }

        test_handsontable(root) {
            const version = root['Handsontable']['version']
            return new Version([version])
        }

        test_highcharts(root) {
            const version = root['Highcharts']['version']
            return new Version([version])
        }

        test_jquerymobile(root) {
            const jq = root.jQuery || root.$
            if (jq.mobile) return new Version([jq.mobile.version])
            return new Version([])
        }

        test_jquerytools(root) {
            const jq = root.jQuery || root.$
            if (jq.tools) return new Version([jq.tools.version])
            return new Version([])
        }

        test_jquery(root) {
            const jq = root.jQuery || root.$
            if (jq.fn) return new Version([jq.fn.jquery])
        }   

        test_jqueryui(root) {
            const jq = root.jQuery || root.$
            if (jq.ui) return new Version([jq.ui.version])
        }

        test_knockout (root) {
            return new Version([root.ko.version])
        }

        test_leaflet (root) {
            return new Version([root['L']['version']])
        }

        test_lodashjs(root) {
            const version = root['_']['VERSION']
            if (version == '4.16.5') return new Version(['4.16.5', '4.16.6'])
            return new Version([version])
        }

        test_mapboxjs (root) {
            return new Version([root.L.mapbox.VERSION])
        }

        test_matterjs (root) {
            const version = root['Matter']['version']
            if (version == 'master') return new Version(['0.9.0', '0.9.1', '0.9.2', '0.9.3', '0.10.0'], '0.9.0~0.10.0')
            return new Version([])
        }

        test_modernizr (root) {
            return new Version([root.Modernizr._version])
        }

        test_momenttimezone (root) {
            return new Version([root.moment.tz.version])
        }

        test_momentjs (root) {
            return new Version([root.moment.version])
        }

        test_mootools (root) {
            return new Version([root.MooTools.version])
        }

        test_mustachejs (root) {
            const version = root['Mustache']['version']
            if (version == '0.2') return new Version(['0.2', '0.2.1'])
            if (version == '0.8.1') return new Version(['0.8.1', '0.8.2'])
            return new Version([version])
        }

        test_numeraljs (root) {
            const version = root['numeral']['version']
            if (version == '1.5.5') return new Version(['1.5.5', '1.5.6'])
            return new Version([version])
        }

        test_pixijs (root) {
            return new Version([root.PIXI.VERSION])
        }

        test_processingjs (root) {
            const version = root['Processing']['version']
            if (version && version != '@VERSION@') return new Version([version])
            return new Version([])
        }

        test_prototype (root) {
            return new Version([root.Prototype.Version])
        }

        test_pusher (root) {
            return new Version([root.Pusher.VERSION])
        }

        test_qooxdoo (root) {
            if (root.qxWeb && root.qxWeb.$$qx && root.qxWeb.$$qx.$$environment) {
                const version = root.qxWeb.$$qx.$$environment["qx.version"]
                return new Version([version])
            }
            return new Version([])
        }

        test_raphael (root) {
            const version = root.Raphael.version
            if (version == '2.1.2') return new Version(['2.1.2', '2.1.3', '2.1.4'], '2.1.2~2.1.4')
            if (version == '@@VERSION') return new Version(['2.2.0'])
            if (version == '2.2.0') return new Version([])
            return new Version([version])
        }

        test_requirejs (root) {
            const req = root.require || root.requirejs
            return new Version([req.version])
        }

        test_riot (root) {
            if (root.$ && root.$.riot && typeof root.$.riot == 'string')
                return new Version([root.$.riot])
            if (root.riot)
                return new Version([root.riot.version])
            return new Version([])
        }

        test_sammyjs (root) {
            return new Version([root.Sammy.VERSION])
        }

        test_scrollmagic(root) {
            return new Version([root.ScrollMagic.version])
        }

        test_seajs (root) {
            const version = root.seajs.version
            if (version == "3.0.1") return new Version(["3.0.1", "3.0.2"])
            return new Version([version])
        }

        test_socketio (root) {
            const version = root.io.version
            if (version == "0.7.9") return new Version(["0.7.9", "0.7.10"])
            if (version == "0.8.2") return new Version(["0.8.2", "0.8.3"])
            return new Version([version])
        }

        test_sugar (root) {
            if (root.Sugar) return new Version([root.Sugar.VERSION])
            return new Version([])
        }

        test_threejs (root) {
            return new Version([root.THREE.REVISION])
        }

        test_tweenjs (root) {
            return new Version([root.TWEEN.REVISION])
        }

        test_twojs (root) {
            const version = root.Two.Version
            if (version == 'v0.7.1') {
                if (root.Two.PublishDate == '2021-01-13T01:57:28.198Z') return new Version(['v0.7.1'])
                if (root.Two.PublishDate == '2021-03-26T16:14:37.868Z') return new Version(['v0.7.2', 'v0.7.3'])
                if (root.Two.PublishDate == '2021-04-02T20:42:48.163Z') return new Version(['v0.7.4'])
            }
            if (version == 'v0.8.4') return new Version(['v0.8.4', 'v0.8.5'])
            return new Version([version])
        }

        test_underscorejs (root) {
            return new Version([root._.VERSION])
        }

        test_velocity (root) {
            if (root.Velocity) return new Version([root.Velocity.version])
            return new Version([])
        }

        test_6to5 (root) {
            return new Version([root.to5.version])
        }

        test_acorn (root) {
            const version = root.acorn.version
            if (version == "3.1.0") return new Version(["3.1.0", "3.2.0"])
            if (version == "6.4.0") return new Version(["6.4.0", "6.4.1"])
            if (version == "7.1.0") return new Version(["7.1.0", "7.1.1"])
            return new Version([version])
        }

        test_alasql (root) {
            const version = root.alasql.version
            if (version == "0.0.44") return new Version(["0.0.44", "0.0.45"])
            if (version == "6.4.0") return new Version(["6.4.0", "6.4.1"])
            return new Version([version])
        }

        test_alpinejs (root) {
            const version = root.Alpine.version
            if (version == "3.0.7") return new Version(["3.0.7", "3.0.8"])
            if (version == "3.10.0") return new Version([
                "3.10.0",
                "3.10.1",
                "3.10.2"
            ])
            return new Version([version])
        }

        test_analyticsjs (root) {
            const version = root.analytics.VERSION
            if (version == "2.3.13") return new Version(["2.3.13", "2.3.14"])
            if (version == "2.8.19") return new Version(["2.8.19", "2.8.20"])
            return new Version([version])
        }

        test_animejs (root) {
            return new Version([root.anime.version])
        }

        test_antdesignvue (root) {
            return new Version([root.antd.version])
        }

        test_antvg2 (root) {
            return new Version([root.G2.VERSION])
        }

        test_antvg6 (root) {
            if (root.G6 && root.G6.version)    return new Version([root.G6.version])
            if (root.G6V5 && root.G6V5.default) return new Version([root.G6V5.default.version])
            return new Version([])
        }

        test_aspnetsignalr (root) {
            return new Version([root.signalR.VERSION])
        }

        test_avalonjs (root) {
            return new Version([root.avalon.version])
        }

        test_axios (root) {
            return new Version([root.axios.VERSION])
        }

        test_babelcore (root) {
            return new Version([root.babel.version])
        }

        test_babelstandalone (root) {
            return new Version([root.Babel.version])
        }

        test_barbajs (root) {
            return new Version([root.Barba.version])
        }

        test_benchmark (root) {
            if (root.Benchmark.version) return new Version([root.Benchmark.version])
            else return new Version(["2.0.0"], "≥ 2.0.0")
        }

        test_bigjs (root) {
            return new Version([root.Big.version])
        }

        test_billboardjs (root) {
            return new Version([root.bb.version])
        }

        test_blockly (root) {
            return new Version(["1.0.0"])
        }

        test_bluebird (root) {
            if (root.P.version) return new Version([root.P.version])
            else return new Version(["0.7.10-1"])
        }

        test_bodymovin (root) {
            const version = root.bodymovin.version
            if (version == "4.1.9") return new Version(["4.2.0", "4.2.1"])
            if (version == "5.0.1") return new Version(["5.0.1", "5.0.2"])
            return new Version([version])
        }

        test_bokeh (root) {
            return new Version([root.Bokeh.version])
        }

        test_bootboxjs (root) {
            return new Version([root.bootbox.VERSION])
        }

        test_c3 (root) {
            if (root.c3.version) return new Version([root.c3.version])
            else return new Version([
                "0.1.1",
                "0.1.10",
                "0.1.11",
                "0.1.12",
                "0.1.13",
                "0.1.14",
                "0.1.15",
                "0.1.16",
                "0.1.17",
                "0.1.18",
                "0.1.19",
                "0.1.2",
                "0.1.20",
                "0.1.21",
                "0.1.22",
                "0.1.23",
                "0.1.24",
                "0.1.3",
                "0.1.4",
                "0.1.5",
                "0.1.6",
                "0.1.7",
                "0.1.8",
                "0.1.9"
            ], '< 0.1.25')
        }

        test_cannonjs (root) {
            if (root.CANNON.version) return new Version([root.CANNON.version])
            else return new Version(["0.4.0", "0.4.3", "0.5.0"])
        }

        test_ccxt (root) {
            if (root.ccxt.Exchange) return new Version([root.ccxt.Exchange.ccxtVersion])
            else return new Version([])
        }

        test_cesium (root) {
            return new Version([root.Cesium.VERSION])
        }

        test_chai (root) {
            return new Version([root.chai.version])
        }

        test_chartist (root) {
            return new Version([root.Chartist.version])
        }

        test_chromajs (root) {
            return new Version([root.chroma.version])
        }

        test_clmtrackr (root) {
            return new Version([root.clm.version])
        }

        test_codemirror (root) {
            const version = root.CodeMirror.version
            if (version == "5.19.0") return new Version(["5.18.3", "5.19.0"])
            return new Version([version])
        }

        test_coffeescript (root) {
            return new Version([root.CoffeeScript.VERSION])
        }

        test_crossfilter (root) {
            return new Version([root.crossfilter.version])
        }

        test_dashjs (root) {
            if (root.dashjs) return new Version([root.dashjs.Version])
            else return new Version([])
        }

        test_dexie (root) {
            if (root.Dexie.semVer) return new Version([root.Dexie.semVer])
            else return new Version([root.Dexie.version])
        }

        test_docute (root) {
            return new Version([root["__DOCUTE_VERSION__"]])
        }

        test_dompurify (root) {
            return new Version([root.DOMPurify.version])
        }

        test_dot (root) {
            return new Version([root.doT.version])
        }

        test_driverjs (root) {
            return new Version(["≥ 1.0.0"])
        }

        test_dropzone (root) {
            return new Version([root.Dropzone.version])
        }

        test_dustjslinkedin (root) {
            return new Version([root.dust.version])
        }

        test_dygraph (root) {
            return new Version([root.Dygraph.VERSION])
        }

        test_EaselJS (root) {
            return new Version([root.EaselJS.VERSION])
        }

        test_echarts (root) {
            const version = root.echarts.version
            if (version == "3.6.0") return new Version(["3.6.0", "3.6.1"])
            return new Version([version])
        }

        test_editorjs (root) {
            return new Version([root.EditorJS.VERSION])
        }

        test_epiceditor (root) {
            return new Version([root.EpicEditor.version])
        }

        test_eruda (root) {
            return new Version([root.eruda.version])
        }

        test_fileuploader (root) {
            return new Version([root.qq.version])
        }

        test_fingerprintjs2 (root) {
            return new Version([root.Fingerprint2.VERSION])
        }

        test_flvjs (root) {
            return new Version([root.flvjs.version])
        }

        test_froalaeditor (root) {
            return new Version([root.FroalaEditor.VERSION])
        }

        test_fullcalendar (root) {
            return new Version([root.FullCalendar.VERSION])
        }

        test_gifshot (root) {
            return new Version([root.gifshot.VERSION])
        }

        test_grapesjs (root) {
            return new Version([root.grapesjs.version])
        }

        test_gsap (root) {
            const versions = root.gsapVersions
            if (versions && Array.isArray(versions)) {
                const v_str = versions.join('; ')
                return new Version([v_str])
            }
            else {
                return new Version([])
            }
        }

        test_holder (root) {
            return new Version([root.Holder.version])
        }

        test_html5shiv (root) {
            return new Version([root.html5.version])
        }

        test_interactjs (root) {
            return new Version([root.interact.version])
        }

        test_introjs (root) {
            return new Version([root.introJs.version])
        }

        test_is_js (root) {
            return new Version([root.is.VERSION])
        }

        test_jade (root) {
            return new Version([root.jade.version])
        }

        test_javascriptstatemachine (root) {
            if (root.StateMachine.version) return new Version([root.StateMachine.version])
            return new Version([root.StateMachine.VERSION])
        }

        test_jointjs (root) {
            return new Version([root.joint.version])
        }

        test_jsencrypt (root) {
            return new Version([root.JSEncrypt.version])
        }

        test_jsonschemafaker (root) {
            if (root.jsf) return new Version([root.jsf.version])
            if (root.JSONSchemaFaker) return new Version([root.JSONSchemaFaker.version])
            return new Version([])
        }

        test_jsondiffpatch (root) {
            return new Version([root.jsondiffpatch.version])
        }

        test_jspdf (root) {
            return new Version([root.jsPDF.version])
        }

        test_jss (root) {
            if (root.jss.version) return new Version([root.jss.version])
            if (root.jss.default && root.jss.default.version) return new Version([root.jss.default.version])
            return new Version([])
        }

        test_jszip (root) {
            return new Version([root.JSZip.version])
        }

        test_KaTeX (root) {
            return new Version([root.katex.version])
        }

        test_kineticjs (root) {
            return new Version([root.Kinetic.version])
        }

        test_konva (root) {
            return new Version([root.Konva.version])
        }

        test_layui (root) {
            return new Version([root.layui.v])
        }

        test_lazyjs (root) {
            if (! root.Lazy.VERSION) return new Version(["0.1.0", "0.1.1"])
            return new Version([root.Lazy.VERSION])
        }

        test_lessjs (root) {
            const version = root.less.version
            if (version && Array.isArray(version)) {
                const v_str = version.join('.')
                return new Version([v_str])
            }
            else {
                return new Version([])
            }
        }

        test_lottieweb (root) {
            return new Version([root.lottie.version])
        }

        test_lunrjs (root) {
            return new Version([root.lunr.version])
        }

        test_mapboxgl (root) {
            return new Version([root.mapboxgl.version])
        }

        test_mediaelement (root) {
            return new Version([root.mejs.version])
        }

        test_mediumeditor (root) {
            if (root.MediumEditor.version)
                return new Version([root.MediumEditor.version.toString()])
            return new Version([])
        }

        test_melonjs (root) {
            return new Version([root.me.version])
        }

        test_metricsgraphics (root) {
            return new Version([root.MG.version])
        }

        test_metro (root) {
            return new Version([root.Metro.version])
        }

        test_microsoftsignalr (root) {
            return new Version([root.signalR.VERSION])
        }

        test_mithril (root) {
            return new Version([root.m.version])
        }

        test_mixitup (root) {
            return new Version([root.mixitup.CORE_VERSION])
        }

        test_mojs (root) {
            return new Version([root.mojs.revision])
        }

        test_mocha (root) {
            return new Version([root.mocha.version])
        }

        test_Mockjs (root) {
            return new Version([root.Mock.version])
        }

        test_moonjs (root) {
            if (root.Moon) return new Version([root.Moon.version])
            if (root.Moonjs) return new Version([root.Moonjs.version])
            return new Version([])
        }

        test_movejs (root) {
            return new Version([root.move.version])
        }

        test_nlp_compromise (root) {
            return new Version([root.nlp_compromise.version])
        }

        test_noUiSlider (root) {
            if (root.noUiSlider.version) return new Version([root.noUiSlider.version])
            return new Version([
                "8.0.0",
                "8.0.1",
                "8.0.2",
                "8.1.0",
                "8.2.0",
                "8.2.1",
                "8.3.0",
                "8.4.0",
                "8.5.0",
                "8.5.1",
                "9.0.0",
                "9.1.0"
            ], "< 9.2.0")
        }

        test_nprogress (root) {
            return new Version([root.NProgress.version])
        }

        test_ol3 (root) {
            return new Version([root.ol.VERSION])
        }

        test_omi (root) {
            return new Version([root.Omi.version])
        }

        test_onnxruntimeweb (root) {
            if (root.ort.env.versions) return new Version([root.ort.env.versions.web || root.ort.env.versions.common])
            return new Version(["1.10.0", "1.11.0", "1.12.0", "1.12.1", "1.13.1", "1.14.0", "1.15.0", "1.15.1"], "1.16.0")
        }

        test_openpgp (root) {
            const version_str = root.openpgp.config.version_string
            if (version_str) {
                if (version_str.length > 11 && version_str[0] == 'O') version_str = version_str.substring(11)    //e.g. "OpenPGP.js v4.10.3"
                return new Version([version_str])
            }
            return new Version([])
        }

        test_phasertest_phaser (root) {
            return new Version([root.Phaser.VERSION])
        }

        test_pica (root) {
            return new Version(["1.0.0", "2.0.8"], "< 3.0.0")
        }

        test_picturefill (root) {
            return new Version(["3.0.0"], "≥ 3.0.0")
        }

        test_placesjs (root) {
            return new Version([root.places.version])
        }

        test_playcanvas (root) {
            return new Version([root.pc.version])
        }

        test_plottablejs (root) {
            if (root.Plottable.version)  return new Version([root.Plottable.version])
            return new Version(["0.19.0"], "< 0.20.0")
        }

        test_polyglotjs (root) {
            return new Version([root.Polyglot.VERSION])
        }

        test_pouchdb (root) {
            return new Version([root.PouchDB.version])
        }

        test_prettier (root) {
            return new Version([root.prettier.version])
        }

        test_pubsubjs (root) {
            return new Version([root.PubSub.version])
        }

        test_quill (root) {
            return new Version([root.quill.version])
        }

        test_qunit (root) {
            return new Version([root.QUnit.version])
        }

        test_ractivejs (root) {
            return new Version([root.Ractive.VERSION])
        }

        test_ramda (root) {
            if (root.ramda && root.ramda.version)  return new Version([root.ramda.version])
            if (root.R && root.R.version)  return new Version([root.R.version])
            return new Version([])
        }

        test_ravenjs (root) {
            return new Version([root.Raven.VERSION])
        }

        test_rax (root) {
            return new Version([root.Rax.version])
        }

        test_reactace (root) {
            return new Version([root.ace.version])
        }

        test_RecordRTC (root) {
            return new Version([root.RecordRTC.version])
        }

        test_remarkable (root) {
            if (root.remarkable.Remarkable) return new Version(["2.0.0"], "≥ 2.0.0")
            else return new Version(["1.4.2", "1.4.7"], "< 2.0.0")
        }

        test_reselect (root) {
            if (root.Reselect.defaultEqualityCheck) return new Version(["4.1.0"], "≥ 4.1.0")
            else return new Version(["2.4.0", "4.0.0"], "< 4.1.0")
        }

        test_revealjs (root) {
            return new Version([root.Reveal.VERSION])
        }

        test_rollup (root) {
            return new Version([root.rollup.VERSION])
        }

        test_san (root) {
            return new Version([root.san.version])
        }

        test_scrollRevealjs (root) {
            return new Version(["4.0.0"], "≥ 4.0.0")
        }

        test_ScrollTrigger (root) {
            return new Version(["1.0.0"], "≥ 1.0.0")
        }

        test_sentrybrowser (root) {
            return new Version([root.Sentry.SDK_VERSION])
        }

        test_skrollr (root) {
            return new Version([root.skrollr.VERSION])
        }

        test_smoothscrollbar (root) {
            return new Version([root.Scrollbar.version])
        }

        test_snabbtjs (root) {
            return new Version(["0.6.1", "0.6.2"], "≥ 0.6.1")
        }

        test_snapsvg (root) {
            return new Version([root.Snap.version])
        }

        test_sockjsclient (root) {
            return new Version([root.SockJS.version])
        }

        test_Sortable (root) {
            const version = root.Sortable.version
            if (version == '1.3.0') return new Version(['1.3.0', '1.4.0'])
            return new Version([version])
        }

        test_SoundJS (root) {
            return new Version([root.createjs.SoundJS.version])
        }

        test_soundmanager2 (root) {
            return new Version([root.soundManager.version])
        }

        test_spinejs (root) {
            return new Version([root.Spine.version])
        }

        test_spritejs (root) {
            const version = root.spritejs.version
            if (version) return new Version([version])
            return new Version(["3.7.21"], "< 3.7.22")
        }

        test_storejs (root) {
            return new Version([root.store.version])
        }

        test_superagent (root) {
            return new Version([root.superagent.version])
        }

        test_sweetalert2 (root) {
            return new Version([root.Sweetalert2.version])
        }

        test_swig (root) {
            return new Version([root.swig.version])
        }

        test_tempusdominus (root) {
            return new Version([root.tempusDominus.version])
        }

        test_tensorflow (root) {
            if (root.tf.data && root.tf.data.version_data)
                return new Version([root.tf.data.version_data])
            if (typeof root.version == "string")
                return new Version([root.version])
            if (root.version.tfjs-core)
                return new Version([root.version.tfjs-core])
            if (root.version.tfjs)
                return new Version([root.version.tfjs])
            return new Version([])
        }

        test_tippyjs (root) {
            return new Version([root.tippy.version])
        }

        test_toastrjs (root) {
            return new Version([root.toastr.version])
        }

        test_topojson (root) {
            return new Version([root.topojson.version])
        }

        test_tweenjs (root) {
            return new Version([root.createjs.TweenJS.version])
        }

        test_UAParserjs (root) {
            return new Version([root.UAParser.VERSION])
        }

        test_underscorestring (root) {
            if (root.s && root.s.VERSION) return new Version([root.s.VERSION])
            if (root._ && root._.string && root._.string.VERSION) return new Version([root._.string.VERSION])
            if (root._ && root._.str && root._.str.VERSION) return new Version([root._.str.VERSION])
            return new Version([])
        }

        test_vanta (root) {
            return new Version([root.VANTA.version])
        }

        test_vConsole (root) {
            if (root.vConsole && root.vConsole.version) return new Version([root.vConsole.version])
            return new Version(["3.0.0"], "≥ 3.0.0")
        }

        test_vanta (root) {
            return new Version([root.vega.version])
        }

        test_vibrantjs (root) {
            return new Version(["1.0.0"])
        }

        test_vivagraphjs (root) {
            return new Version([root.Viva.Graph.version])
        }

        test_voca (root) {
            return new Version([root.v.version])
        }

        test_vuechartjs (root) {
            if (root.VueChartJs.VueCharts && root.VueChartJs.VueCharts.version)
                return new Version([root.VueChartJs.VueCharts.version])
            return new Version([])
        }

        test_vuex (root) {
            return new Version([root.Vuex.version])
        }

        test_wade (root) {
            return new Version([root.Wade.version])
        }

        test_wretch (root) {
            return new Version(["2.0.0"], "≥ 2.0.0")
        }

        test_wysihtml (root) {
            return new Version([root.wysihtml5.version])
        }

        test_xls (root) {
            return new Version([root.XLS.version])
        }

        test_xlsx (root) {
            return new Version([root.XLSX.version])
        }

        test_xregexp (root) {
            return new Version([root.XRegExp.version])
        }

        test_zeroclipboard (root) {
            return new Version([root.ZeroClipboard.version])
        }

        test_zrender (root) {
            return new Version([root.zrender.version])
        }

    }
})();

