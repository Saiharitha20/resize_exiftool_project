const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, exec } = require('child_process');
const chokidar = require('chokidar');
const exifr = require('exifr');

if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('haritha-app', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('haritha-app');
}

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            enableRemoteModule: false,
        },
    });

    mainWindow.loadFile('index.html');

    mainWindow.webContents.on('did-finish-load', () => {
        openFolderDialog();
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

function openFolderDialog() {
    dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
    }).then((result) => {
        if (!result.canceled) {
            processImages(result.filePaths[0]);
        }
    }).catch((err) => {
        console.log(err);
    });
}

async function processImages(folderPath) {
    try {
        const tempDir = os.tmpdir();
        const outputPath = path.join(tempDir, 'haritha');

        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath);
        }

        const allFiles = fs.readdirSync(folderPath);
        const totalFilesCount = allFiles.length;

        const validExtensions = ['.cr2', '.arw', '.nef', '.jpg'];
        const inputFiles = allFiles.filter(file => validExtensions.includes(path.extname(file).toLowerCase()));
        const filteredFilesCount = inputFiles.length;

        console.log('All Files in Folder:', allFiles);
        console.log('Filtered Files:', inputFiles);
        console.log('Total Files Count:', totalFilesCount);
        console.log('Filtered Files Count:', filteredFilesCount);

        let processedFilesCount = 0;
        let newFilesCount = 0;
        let ratePerSecond = 0;
        let ratePerFiveSeconds = 0;

        mainWindow.webContents.send('progress-init', { totalFiles: filteredFilesCount });

        const watcher = chokidar.watch(outputPath, { ignoreInitial: true });

        watcher.on('add', filePath => {
            newFilesCount++;
            processedFilesCount++;
            console.log(`File added: ${filePath}`);
            mainWindow.webContents.send('progress-update', { processedFilesCount });
        });

        setInterval(() => {
            ratePerSecond = newFilesCount;
            mainWindow.webContents.send('rate-update', { ratePerSecond });
            newFilesCount = 0;
        }, 1000);

        setInterval(() => {
            ratePerFiveSeconds = newFilesCount / 5;
            mainWindow.webContents.send('rate-update', { ratePerFiveSeconds });
        }, 5000);

        const resizeLog = await runExecutable('D:/Downloads/sharp.exe', ['-i', folderPath, '-o', outputPath]);
        console.log('Resize Log:', resizeLog);

        const startExifTime = Date.now();
        const exifToolArgs = [
            '-ext', 'cr2',
            '-ext', 'arw',
            '-b',
            '-previewimage',
            '-w!', path.join(outputPath, '%f.jpg'),
            '-r',
            folderPath
        ];

        console.log('Running exiftool with arguments:', exifToolArgs.join(' '));

        const exifLog = await runExecutable('D:/Downloads/exiftool.exe', exifToolArgs);
        console.log('ExifTool Log:', exifLog);

        const nefArgs = [
            '-b',
            '-jpgfromraw',
            '-w', path.join(outputPath, '%f.jpg'),
            '-ext', 'nef',
            '-r',
            folderPath,
        ];

        console.log('Running exiftool with arguments:', nefArgs.join(' '));

        const nefLog = await runExecutable('D:/Downloads/exiftool.exe', nefArgs);
        console.log('ExifTool NEF Log:', nefLog);

        const endExifTime = Date.now();
        const exifTimeTaken = (endExifTime - startExifTime) / 1000;
        console.log(`ExifTool processing time: ${exifTimeTaken} seconds`);

        // Copy metadata from RAW to JPG
        console.log('Starting metadata copy...');
        const metadataCopyResult = await copyMetadata(folderPath, outputPath);
        console.log('Metadata copy result:', metadataCopyResult);

        // Cleanup temporary files
        await cleanupTempFiles(outputPath);

        console.log('Starting metadata extraction...');
        const metadataResult = await extractMetadata(outputPath);
        console.log('Metadata extraction result:', metadataResult);

        mainWindow.webContents.send('processing-complete', {
            resizeLog,
            exifLog: exifLog + '\n' + nefLog,
            outputPath,
            totalFilesCount,
            filteredFilesCount,
            processedFilesCount,
            exifTimeTaken,
            metadataCopyResult,
            metadataExtraction: metadataResult,
        });
    } catch (error) {
        console.error('Unhandled error in processImages:', error);
        mainWindow.webContents.send('processing-error', error.message || error);
    }
}

function copyMetadata(rawDir, jpgDir) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        console.log('Starting metadata copy...');

        try {
            const rawFiles = fs.readdirSync(rawDir);
            const jpgFiles = fs.readdirSync(jpgDir);

            let processedFiles = 0;
            rawFiles.forEach((rawFile, index) => {
                const rawBase = path.basename(rawFile, path.extname(rawFile));
                const matchingJpg = jpgFiles.find(jpgFile => path.basename(jpgFile, '.jpg') === rawBase);

                if (matchingJpg) {
                    const rawFilePath = path.join(rawDir, rawFile);
                    const jpgFilePath = path.join(jpgDir, matchingJpg);

                    exec(`exiftool -tagsFromFile "${rawFilePath}" -all:all -overwrite_original "${jpgFilePath}"`, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`Error copying metadata from ${rawFilePath} to ${jpgFilePath}:`, stderr);
                        } else {
                            console.log(`Copied metadata from ${rawFilePath} to ${jpgFilePath}:`, stdout);
                        }
                        processedFiles++;
                        if (processedFiles === rawFiles.length) {
                            const endTime = Date.now();
                            const elapsedTime = (endTime - startTime) / 1000;
                            console.log(`Metadata copy completed in ${elapsedTime.toFixed(2)} seconds`);
                            resolve({ success: true, elapsedTime });
                        }
                    });
                } else {
                    console.warn(`No matching JPG found for RAW file ${rawFile}`);
                    processedFiles++;
                    if (processedFiles === rawFiles.length) {
                        const endTime = Date.now();
                        const elapsedTime = (endTime - startTime) / 1000;
                        console.log(`Metadata copy completed in ${elapsedTime.toFixed(2)} seconds`);
                        resolve({ success: true, elapsedTime });
                    }
                }
            });
        } catch (error) {
            console.error('Error processing directories:', error.message);
            const endTime = Date.now();
            const elapsedTime = (endTime - startTime) / 1000;
            console.log(`Metadata copy failed after ${elapsedTime.toFixed(2)} seconds`);
            reject({ success: false, error: error.message, elapsedTime });
        }
    });
}

async function extractMetadata(directoryPath) {
    const startTime = Date.now();
    console.log('Starting metadata extraction...');

    const metadataList = [];

    try {
        const files = fs.readdirSync(directoryPath);
        console.log(`Found ${files.length} files in directory: ${directoryPath}`);

        for (const file of files) {
            if (file === 'metadata.json') continue;

            const filePath = path.join(directoryPath, file);
            console.log(`Processing file: ${filePath}`);
            
            if (isImage(filePath)) {
                try {
                    console.log(`Attempting to extract metadata from: ${filePath}`);
                    const metadata = await exifr.parse(filePath);
                    if (metadata) {
                        metadataList.push({ file, metadata });
                        console.log(`Metadata extracted for ${file}:`, JSON.stringify(metadata, null, 2));
                    } else {
                        console.warn(`No metadata found for ${file}`);
                    }
                } catch (error) {
                    console.error(`Error extracting metadata from ${file}:`, error.message);
                }
            } else {
                console.warn(`${file} is not a supported image format`);
            }
        }

        const outputFilePath = path.join(directoryPath, 'metadata.json');
        fs.writeFileSync(outputFilePath, JSON.stringify(metadataList, null, 2));
        console.log(`Metadata saved to ${outputFilePath}`);
        const endTime = Date.now();
        const elapsedTime = (endTime - startTime) / 1000;
        console.log(`Metadata extraction completed in ${elapsedTime.toFixed(2)} seconds`);
        return { success: true, elapsedTime, outputFilePath };
    } catch (error) {
        console.error('Error during metadata extraction:', error.message);
        const endTime = Date.now();
        const elapsedTime = (endTime - startTime) / 1000;
        console.log(`Metadata extraction failed after ${elapsedTime.toFixed(2)} seconds`);
        return { success: false, error: error.message, elapsedTime };
    }
}

function isImage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.tiff', '.cr2', '.arw', '.nef'].includes(ext);
}

function cleanupTempFiles(directory) {
    return new Promise((resolve, reject) => {
        fs.readdir(directory, (err, files) => {
            if (err) {
                console.error('Error reading directory for cleanup:', err);
                reject(err);
                return;
            }

            const deletePromises = files.map(file => {
                return new Promise((resolveFile, rejectFile) => {
                    if (file.endsWith('_exiftool_tmp') || file.endsWith('_original')) {
                        fs.unlink(path.join(directory, file), (err) => {
                            if (err) {
                                console.error(`Error deleting file ${file}:`, err);
                                rejectFile(err);
                            } else {
                                console.log(`Deleted temporary file: ${file}`);
                                resolveFile();
                            }
                        });
                    } else {
                        resolveFile();
                    }
                });
            });

            Promise.all(deletePromises)
                .then(() => {
                    console.log('Cleanup completed');
                    resolve();
                })
                .catch(error => {
                    console.error('Error during cleanup:', error);
                    reject(error);
                });
        });
    });
}

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
    });
    if (result.canceled) {
        return null;
    }
    return result.filePaths[0];
});

function runExecutable(executablePath, args) {
    console.log('Running:', executablePath, args.join(' '));
    return new Promise((resolve, reject) => {
        execFile(executablePath, args, (error, stdout, stderr) => {
            if (error) {
                reject(`${error.message}\n${stderr}`);
            } else {
                resolve(stdout + '\n' + stderr);
            }
        });
    });
}