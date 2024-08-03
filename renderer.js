document.addEventListener('DOMContentLoaded', () => {
    const statusElement = document.getElementById('status');
    const outputElement = document.getElementById('output');
    const progressBar = document.getElementById('progress-bar');
    const progressLabel = document.getElementById('progress-label');

    document.getElementById('select-folder').addEventListener('click', async () => {
        const folderPath = await window.electronAPI.selectFolder();
        if (folderPath) {
            statusElement.innerText = 'Processing...';
        }
    });

    window.electronAPI.onProcessingComplete((event, result) => {
        statusElement.innerText = 'Processing complete! Output displayed below:';
        
        const resizeOutput = document.createElement('pre');
        resizeOutput.textContent = `Resize Log:\n${result.resizeLog}`;
        outputElement.appendChild(resizeOutput);
        
        const exifOutput = document.createElement('pre');
        exifOutput.textContent = `ExifTool Log:\n${result.exifLog}`;
        outputElement.appendChild(exifOutput);

        const timeTakenElement = document.createElement('p');
        timeTakenElement.textContent = `ExifTool processing time: ${result.exifTimeTaken} seconds`;
        outputElement.appendChild(timeTakenElement);
    
        const outputPathElement = document.createElement('p');
        outputPathElement.textContent = `Output Path: ${result.outputPath}`;
        outputElement.appendChild(outputPathElement);
    
        const totalFilesElement = document.createElement('p');
        totalFilesElement.textContent = `Total Files in Input Folder: ${result.totalFilesCount}`;
        outputElement.appendChild(totalFilesElement);
    
        const filteredFilesElement = document.createElement('p');
        filteredFilesElement.textContent = `Filtered Files Count: ${result.filteredFilesCount}`;
        outputElement.appendChild(filteredFilesElement);
    
        const processedFilesElement = document.createElement('p');
        processedFilesElement.textContent = `Processed Files Count: ${result.processedFilesCount}`;
        outputElement.appendChild(processedFilesElement);
    });
    

    window.electronAPI.onProcessingError((event, errorMessage) => {
        statusElement.innerText = `Error: ${errorMessage}`;
    });

    window.electronAPI.onProgressInit((event, data) => {
        progressBar.max = data.totalFiles;
        progressBar.value = 0;
        progressLabel.innerText = `0 / ${data.totalFiles}`;
    });

    window.electronAPI.onProgressUpdate((event, data) => {
        progressBar.value = data.processedFilesCount;
        progressLabel.innerText = `${data.processedFilesCount} / ${progressBar.max}`;
    });

    window.electronAPI.onRateUpdate((event, data) => {
        const rateElement = document.createElement('p');
        rateElement.textContent = `Rate Update: ${data.ratePerSecond !== undefined ? `Per second: ${data.ratePerSecond} files/sec` : ''} ${data.ratePerFiveSeconds !== undefined ? `Per 5 seconds: ${data.ratePerFiveSeconds} files/sec` : ''}`;
        outputElement.appendChild(rateElement);
    });
});
