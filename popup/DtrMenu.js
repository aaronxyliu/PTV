

function sendCmd(cmd) {
    chrome.tabs.query({ currentWindow: true, active: true }, (tabs)=>{
        chrome.tabs.sendMessage(tabs[0].id, {
            command: cmd
        });
    });

}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("dt_btn").addEventListener("click", () => sendCmd("detect"));
});

chrome.runtime.onMessage.addListener(
    function(request) {
      if (request.command === "showresult") {
        let result_str = '['
        let score_list = request.data
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
        document.getElementById("result-num").innerHTML = `#Lib: ${lib_num}`
        document.getElementById("result").innerHTML = result_str
      }
        
    }
  );


// function listenForClicks() {
//     document.addEventListener("click", (e) => {
//         console.log('listenforclick!')
//         switch (e.target.id) {
//             case "gt_btn":
//                 return sendCmd('genTree')
//             case "at_btn":
//                 return sendCmd('analTree')
//             case "dt_btn":
//                 return sendCmd('detect')
//         }
//     }
// )}

// function reportExecuteScriptError(error) {
//     console.error(`Failed to execute beastify content script: ${error.message}`);
//   }

/**
* When the popup loads, inject a content script into the active tab,
* and add a click handler.
* If we couldn't inject the script, handle the error.
*/

