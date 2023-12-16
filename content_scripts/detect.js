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
            this.ptr = this.ptr[attribute_name]
            return true
        }

        growFrom(PR, attribute_name) {  // PR is an instance of PropertyRecord
            if (PR.ptr == undefined || PR.ptr == null) return false

            this.path_list = [...PR.path_list]
            this.par_ptrs = [...PR.par_ptrs]
            this.path_list.push(attribute_name)
            this.par_ptrs.push(PR.ptr)
            this.ptr = PR.ptr[attribute_name]
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
                    lib.version = this.VerDe[v_func](lib.locationPtr())
                }

                if (!lib.version instanceof Version) {
                    console.log(`Warning: function ${v_func} must return as a <Version> object.`)
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
                    lib.version = this.VerDe[post_v_func](lib.locationPtr())
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
                    version: lib.version.version_string
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

            // Find all keywords in the web object tree
            let L = new Libraries(libInfoList)
            L.findLibs(blacklist)
            await L.checkVersion(baseurl)

            console.log(L.libs)

            this.window.postMessage({type: 'response', detected_libs: L.convertToJson()}, "*")
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
    }
})();

