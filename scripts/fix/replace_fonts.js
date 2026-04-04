const fs = require('fs');
const path = require('path');

function replaceInFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      replaceInFiles(filePath);
    } else if (filePath.endsWith('.tsx') || filePath.endsWith('.css') || filePath.endsWith('.ts') || filePath.endsWith('.js')) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      const original = content;
      content = content.replace(/'Inter'/g, "'Roboto'");
      content = content.replace(/"Inter"/g, '"Roboto"');
      content = content.replace(/Inter, sans-serif/g, 'Roboto, sans-serif');
      // For font-family: Inter in CSS
      content = content.replace(/font-family:\s*Inter/g, 'font-family: Roboto');
      
      if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Updated ' + filePath);
      }
    }
  }
}

replaceInFiles(path.resolve(__dirname, '..', '..', 'frontend', 'src'));
