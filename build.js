const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Define directories
const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');
const tempDir = path.join(__dirname, 'temp');

// Create temporary directory for packaging
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Create dist directory if it doesn't exist
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

// Copy source files to temporary directory
fs.readdirSync(srcDir).forEach(file => {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(tempDir, file);
  
  // Only copy .js files
  if (path.extname(file) === '.js') {
    console.log(`Copying ${file} to temp directory...`);
    fs.copyFileSync(srcPath, destPath);
  }
});

// Create package.json in temp directory with only the dependencies we need
const packageJson = {
  "dependencies": {
    "axios": "^1.9.0",
    "aws-sdk": "^2.1692.0"
  }
};

fs.writeFileSync(
  path.join(tempDir, 'package.json'),
  JSON.stringify(packageJson, null, 2)
);

// Install dependencies in the temporary directory
console.log('Installing dependencies in temp directory...');
exec('cd temp && npm install --production', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error installing dependencies: ${error.message}`);
    return;
  }
  
  if (stderr) {
    console.error(`stderr: ${stderr}`);
  }
  
  console.log(`stdout: ${stdout}`);
  console.log('Dependencies installed successfully.');
  
  // Create zip package
  console.log('Creating Lambda deployment package...');
  exec(`cd temp && zip -r ../dist/lambda-package.zip .`, (zipError, zipStdout, zipStderr) => {
    if (zipError) {
      console.error(`Error creating zip: ${zipError.message}`);
      return;
    }
    
    if (zipStderr) {
      console.error(`zip stderr: ${zipStderr}`);
    }
    
    console.log(`zip stdout: ${zipStdout}`);
    console.log('Lambda deployment package created successfully!');
    
    // Clean up temp directory
    console.log('Cleaning up temp directory...');
    exec(`rm -rf ${tempDir}`, (rmError) => {
      if (rmError) {
        console.error(`Error cleaning up: ${rmError.message}`);
        return;
      }
      
      console.log('Build process completed successfully!');
    });
  });
});