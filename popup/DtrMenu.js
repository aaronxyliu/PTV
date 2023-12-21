

function sendCmd(cmd) {
    chrome.tabs.query({ currentWindow: true, active: true }, (tabs)=>{
        chrome.tabs.sendMessage(tabs[0].id, {
            command: cmd
        });
    });

}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("dt_btn").addEventListener("click", () => {
      sendCmd("detect");
      document.getElementById("zero_text").setAttribute('class', 'hidden')
      document.getElementById("dt_btn").innerHTML = 'detecting...';
      document.getElementById("dt_btn").disabled = true;
      document.getElementById('LibAccordion').innerHTML = '';
    });
});

chrome.runtime.onMessage.addListener(
    function(request) {
      if (request.command === "showresult") {
        const lib_list = request.data
        if (lib_list.length == 0) {
          document.getElementById("zero_text").setAttribute('class', '')
        }
        else {
          document.getElementById("zero_text").setAttribute('class', 'hidden')
          const LibAccordion = document.getElementById('LibAccordion')
          const libname_record = new Set() // Record all libraries appeared, prevent repeating
          for (let lib_info of lib_list) {
            let libname = lib_info['libname']
            let accordian_id = `collapse_${libname.replace('.','').replace('-','')}`
            if (libname_record.has(libname)) {
              // If the library entry already added
              document.getElementById(`${accordian_id}_body`).innerHTML += `<hr/>
              <strong>Version: </strong> ${lib_info['version']}  </br>
              <strong>Location: </strong> ${lib_info['location']}`
            }
            else {
              libname_record.add(libname)
              let accordian_template = `
                <div class="accordion-item">
                  <h2 class="accordion-header">
                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${accordian_id}" aria-expanded="false" aria-controls="${accordian_id}">
                      ${libname}
                    </button>
                  </h2>
                  <div id="${accordian_id}" class="accordion-collapse collapse" data-bs-parent="#accordionExample">
                    <div id="${accordian_id}_body" class="accordion-body">
                      <strong>Link: </strong> ${lib_info['url']} <hr/>
                      <strong>Version: </strong> ${lib_info['version']}  </br>
                      <strong>Location: </strong> ${lib_info['location']}
                    </div>
                  </div>
                </div>`
              LibAccordion.innerHTML += accordian_template
            }
          }
        }
        document.getElementById("dt_btn").innerHTML = 'detect again'
        document.getElementById("dt_btn").disabled = false;

      }
        
    }
  );

/**
* When the popup loads, inject a content script into the active tab,
* and add a click handler.
* If we couldn't inject the script, handle the error.
*/

