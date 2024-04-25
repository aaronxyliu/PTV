// function sendCmd(cmd) {
//     chrome.tabs.query({ currentWindow: true, active: true }, (tabs)=>{
//         chrome.tabs.sendMessage(tabs[0].id, {
//             command: cmd
//         });
//     });

// }

// // Keyboard Hotkey
// chrome.commands.onCommand.addListener((command) => {
//     if (command == 'run-detect')
//         sendCmd('detect');
// });