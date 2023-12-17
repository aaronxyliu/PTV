### Library Detector (Academic Tool)



#### What is this?

Library Detector (Academic Tool) is a Chrome extension which can detect all JavaScript libraries runs behind the web and examine their versions. PTV collects over 6,000 libraries information from [cdnjs](https://cdnjs.com/). The library detection ability has academic research support. More information please refer to the ASE 2023 paper [PTdetector: An Automated JavaScript Front-end Library Detector](https://www.researchgate.net/publication/373638073_PTDETECTOR_An_Automated_JavaScript_Front-end_Library_Detector).

#### How does it work?

PTV applies pTree-based detection during the browser runtime. We collect pTree information for each library in advance and extract their valuable detection feature. The feature generation process is compeleted in the repository [PTV-gen](https://github.com/aaronxyliu/Anonymous).

#### How to use?

Considering that there is still a lot of room for improvement in this tool, we are not in a hurry to publish it on the chrome web store. Currently this tool can only be used by importing from local file system.

For developers: open the Chrome browser, navigate to `chrome://extensions/` site, , click the "Load Unpacked" button to load this whole folder. Then, pin it in the browser extensions menu.

In the popup, click the "detect" button. The detectioned libraries and corresponding versions will show. Sometimes, one library may relate to mutiple versions. In most cases (in face, except core-js), it means the correct version is one of them – the detector can not tell the minor difference between these versions.

![example](img/example.png)

#### Contibution

Want to contribute? Feel free to contact **aaronxyliu@gmail.com**.



