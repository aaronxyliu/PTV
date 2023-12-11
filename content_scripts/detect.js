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
            if (this.path_list.length < 1 || this.ptr == undefined) 
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
            this.version = null
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

            if (property == undefined) {
                if (_dict['t'] == 1) return true;
                else return false;
            }
            if (property == null) {
                if (_dict['t'] == 2) return true;
                else return false;
            }
            if (this.isArraySetMap(property)) {
                return true;    // NEED CHANGE TO MD5 CHECK !!
            }
            if (typeof (property) == 'string') {
                if (_dict['t'] == 4 && _dict['v'] == v.slice(0, 24).replace(/<|>/g, '_')) return true;
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
                if (_dict['t'] == 7 && _dict['v'] == v.toFixed(2)) return true;
                else return false;
            }
            // Other condition
            if (_dict['t'] == typeof (property)) return true;
            else return false;
        }
    }

    class Libraries {
        constructor(libInfoList) {
            this.libs = []
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
                            if (_pr.ptr == undefined) feature_hold = false
            
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
                const libInfo = this.libInfoList[lib.index]
                const v_func = libInfo['function']

                if (this.VerDe[v_func] != undefined && typeof this.VerDe[v_func] == 'function') {
                    lib.version = this.VerDe[v_func](lib.locationPtr())
                }

                if (lib.version == null || lib.version == 'unknown') {
                    if (libInfo.hasOwnProperty('versionfile')) {
                        // Determine version by pTree comparison
                        const response = await window.fetch(`${baseurl}/versions/${libInfo['versionfile']}`)
                        if (response.status == 200) {
                            // Version file exists
                            const version_dict = await response.json()
                            for (let [_, version_entry] of Object.entries(version_dict)) {
                                if (version_entry['compasison_result'] == undefined) {
                                    version_entry['compasison_result'] = lib.compareWithPTree(version_entry['pTree'])
                                }
                                if (version_entry['compasison_result'] == true) {
                                    // Ensure no supertree matching
                                    let have_S_match = false
                                    for (let S_index of version_entry['Sm']) {
                                        let S_entry = version_dict[S_index]
                                        if (S_entry['compasison_result'] == undefined) {
                                            S_entry['compasison_result'] = lib.compareWithPTree(S_entry['pTree'])
                                        }
                                        if (S_entry['compasison_result'] == true) {
                                            have_S_match = true
                                            break
                                        }
                                    }
                                    if (!have_S_match) {
                                        // Find the correct version
                                        lib.version = version_entry['version']
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

            }

        }
    }

    

    

    
    function compare_Dict_V (_dict, v) {
        if (!_dict) return false;
        if (v == undefined) {
            if (_dict['t'] == 1) return true;
            else return false;
        }
        if (v == null) {
            if (_dict['t'] == 2) return true;
            else return false;
        }
        if (isArraySetMap(v)) {
            if (_dict['t'] == 3 && _dict['v'] == v.length) return true;
            else return false;
        }
        if (typeof (v) == 'string') {
            if (_dict['t'] == 4 && _dict['v'] == v.slice(0, 10).replace(/<|>/g, '_')) return true;
            else return false;
        }
        if (typeof (v) == 'object') {
            if (_dict['t'] == 5) return true;
            else return false;
        }
        if (typeof (v) == 'function') {
            if (_dict['t'] == 6) return true;
            else return false;        
        }
        if (typeof (v) == 'number') {
            if (_dict['t'] == 7 && _dict['v'] == v.toFixed(2)) return true;
            else return false;
        }
        // Other condition
        if (_dict['t'] == typeof (v)) return true;
        else return false;
    }
    
    function matchPTree(pt, base) {
        // BFS
        let match_record = {}
        let q = []      // Property Path Queue
        let qc = []     // pTree Queue
        q.push([])
        qc.push(pt)

        while (qc.length) {
            let v_path = q.shift()
            let cur_node = qc.shift()

            let v_str = base
            for (let v of v_path) {
                v_str += `["${v}"]`
            }

            // match_record:
            //  { file_id: {
            //      'credit1': credit1 score
            //      'matched': matched node number
            //   } }

            for (let _dict of cur_node['d']) {
                if (eval(`compare_Dict_V (_dict['d'], ${v_str})`)) {
                    for (let lib_info of _dict['Ls']) {
                        let file_id = lib_info['F']
                        let credit1 = lib_info['x']
                        if (match_record.hasOwnProperty(file_id)) {
                            match_record[file_id]['credit1'] += credit1
                            match_record[file_id]['matched'] += 1
                        }
                        else {
                            match_record[file_id] = {'credit1': credit1, 'matched': 1, 'base': base}
                        }
                        // if (file_id == 1) {
                        //     console.log(v_str)
                        // }
                    }
                }
            }

            let v_prop = eval(`getAttr(${v_str})`)

            for (let child of cur_node['c']) {
                if (v_prop.includes(child['n'])) {
                    
                    q.push([...v_path])              // shallow copy
                    q[q.length - 1].push(child['n'])
                    qc.push(child)
                }
            }             

        }
        return match_record
    }

    function classifyLib(match_records, file_list) {
        let lib_match_list = {}

        // lib_match_list: {
        //     lib_name: {
        //         file_name: { 
        //              base: [ {
        //                  'credit1': credit1 score
        //                  'matched': matched node number
        //                  'root': root node name
        //              } ... ]
        //         }
        //     }
        // }

        for (let match_record_pair of match_records) {
            let match_record = match_record_pair[0]
            for (let file_id in match_record) {
                // let file_tag = file_list[file_id]
                // let at_index = file_tag.indexOf('@')
                // let lib_name = file_tag.slice(0, at_index)
                let file_obj = file_list[file_id]
                let lib_name = file_obj['libname']
                let file_name = `${file_obj['filename']} (${file_obj['version']})`
                let base = match_record_pair[1]

                let unit_info = match_record[file_id]
                unit_info['root'] = match_record_pair[2]

                if (!lib_match_list.hasOwnProperty(lib_name)) {
                    lib_match_list[lib_name] = {}
                }
                if (!lib_match_list[lib_name].hasOwnProperty(file_name)) {
                    lib_match_list[lib_name][file_name] = {}
                }
                if (!lib_match_list[lib_name][file_name].hasOwnProperty(base)) {
                    lib_match_list[lib_name][file_name][base] = []
                }
                lib_match_list[lib_name][file_name][base].push(unit_info)
            }
        }
        return lib_match_list
    }

    function calScore(lib_match_list) {
        let new_lib = []
        for (let lib_name in lib_match_list) {
            let files = lib_match_list[lib_name]
            let new_file = []
            for (let file_name in files) {
                let bases = files[file_name]
                let new_base = []
                for (let base in bases) {
                    let unit_list = bases[base]
                    credit1_sum = 0
                    matched_sum = 0
                    matched_keys = []
                    for (let unit of unit_list) {
                        credit1_sum += unit['credit1']
                        matched_sum += unit['matched']
                        matched_keys.push(unit['root'])
                    }
                    new_base.push({'base name': base, 'credit1': credit1_sum, 'matched': matched_sum, 'keys': matched_keys})
                }
                new_file.push({'file name': file_name, 'bases': new_base})
            }
            new_lib.push({'lib name': lib_name, 'files': new_file})
            
        }
        return new_lib
    }

    function sortScore(score_list) {
        for (let lib_info of score_list) {
            for (let file_info of lib_info['files']) {
                file_info['bases'].sort((a, b) => b['credit1']-a['credit1'])
            }
            lib_info['files'].sort((a, b) => b['bases'][0]['credit1']-a['bases'][0]['credit1'])
            lib_info['score'] = lib_info['files'][0]['bases'][0]['credit1']
            let base_name = lib_info['files'][0]['bases'][0]['base name']
            lib_info['base depth'] = 1
            for (let char of base_name) {
                if (char == '[') {
                    lib_info['base depth'] += 1
                }
            }
        }
        score_list.sort((a, b) => b['score']-a['score'])
    }

    function filterList(lib_match_list) {
        let newlist = []
        for (let lib_info of lib_match_list) {
            if (lib_info['files'][0]['bases'][0]['matched'] > 1)
                newlist.push(lib_info)
        }
        return newlist
    }

    function ResultToString(score_list) {
        let result_str = '['
        let lib_num = 0
        for (let lib_info of score_list) {
            if (lib_info["score"] < 50)
                continue
            result_str += `"${lib_info["lib name"]}:${lib_info["score"].toFixed(2)}!${lib_info["base depth"]}",`
            lib_num += 1
        }
        if (lib_num > 0)
            result_str = result_str.slice(0, result_str.length-1)
        result_str += ']'
        return result_str
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
            console.log(blacklist)

            // for (let i =0; i<10; i+=1){
            //     let a = new PropertyRecord()
            //     a.grow('core')
            //     console.log(a)
            // }
            

            // Find all keywords in the web object tree
            let L = new Libraries(libInfoList)
            L.findLibs(blacklist)
            L.checkVersion(baseurl)

            console.log(L.libs)



            // let requests = event.data.urls.map((url) => {
            //     return fetch(url).then((response) => {
            //         return response.json()})
            // });
            // Promise.all(requests)
            //     .then((results) => {
            //         let blacklist = results[0]
            //         let pts = results[1]
            //         let file_list = results[2]

            //         // Used to calculate spending time
            //         let start_time = Date.now()

            //         // Find all keywords in the web object tree
            //         let keyword_list = findKeywords(pts, blacklist, 3)
            //         // console.log(keyword_list);

            //         // Calculate the credit for each library
            //         let match_records = []
            //         for (let keyword of keyword_list) {
            //             let v_base = keyword[0]
            //             let v_name = keyword[1]

            //             let pt = pts[v_name]
            //             let match_record = matchPTree(pt, `${v_base}["${v_name}"]`)
            //             match_records.push([match_record, v_base, v_name])
            //         }

            //         // Classify match_record based on lib name
            //         lib_match_list = classifyLib(match_records, file_list)
            //         score_list = calScore(lib_match_list)

            //         let end_time = Date.now()

            //         // Sort the result based on credit score
            //         sortScore(score_list)
            //         console.log('All detected lib:')
            //         console.log(score_list)

            //         console.log('Filtered (#matched > 1):')
            //         score_list = filterList(score_list)
            //         console.log(score_list)

            //         window.postMessage({type: 'response', detected_libs: score_list}, "*")

            //         // Only used for Selenium automation
            //         var detectTimeMeta = document.getElementById('lib-detect-time')
            //         detectTimeMeta.setAttribute("content", end_time - start_time);

            //         var detectResultMeta = document.getElementById('lib-detect-result')
            //         detectResultMeta.setAttribute("content", ResultToString(score_list));

            //    })

        }

    });

    class VersionDetermine {
        constructor() {

        }

        test_corejs(root) {
            const shared = root['__core-js_shared__']
            const core = root.core
            if (core) {
                return core.version || 'unknown';
            }
            else if (shared) {
                const versions = shared.versions
                if (Array.isArray(versions)) {
                    return versions.map(it => `core-js-${ it.mode }@${ it.version }`).join('; ')
                }
                else {
                    return 'unknown'
                }
            }
            return 'unknown'
        }
    
        test_backbonejs(root) {
            return 'unknown'
        }

    }
})();

