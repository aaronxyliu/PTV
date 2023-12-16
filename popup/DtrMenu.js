

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
        const lib_list = request.data
        const lib_num = lib_list.length
        let show_str = ''
        for (let lib_info of lib_list) {
            show_str += `<a href="${lib_info['url']}">${lib_info['libname']}</a>`
            show_str += `<div>${lib_info['version']}</div>`
            show_str += '\n'
        }

        document.getElementById("result-num").innerHTML = `# Libs: ${lib_num}`
        document.getElementById("result").innerHTML = show_str
      }
        
    }
  );

/**
* When the popup loads, inject a content script into the active tab,
* and add a click handler.
* If we couldn't inject the script, handle the error.
*/

