const fs = require('fs');
const path = require('path');

const { analyzeTextByRegex } = require('../services/dlp.service.regex');
const { initDocumentEmbeddings, addDocumentEmbeddings, loadVectorIndex, compareVectors} = require('../services/dlp.service.vector');

const dlpController = {
  async initDocumentEmbeddings(req, res) {
    const folderPath = req.query.path || './sanitized';
     try {
      const { index, fileMap } = await initDocumentEmbeddings(folderPath);
      res.json({
        success: true,
        files: fileMap,
        message: `총 ${fileMap.length}개 문서를 임베딩했습니다.`,
      });
     } catch (err) {
       res.status(500).json({ success: false, error: err.message });
     }
  },

  async addDocumentEmbeddings(req, res) {
    const folderPath = req.query.path || './sanitized';
    try {
      const {index, fileMap } = await addDocumentEmbeddings(folderPath);
      res.json({
        success: true,
        files: fileMap,
        message: `총 ${fileMap.length}개 문서를 임베딩했습니다.`,
      });
    } catch (err) {
       res.status(500).json({ success: false, error: err.message });
    }
  },
  
  async loadVectorIndex(req, res) {
    try {
    const {index, fileMap} = await loadVectorIndex();
      res.json({
        success: true,
        files: fileMap,
        message: ``,
      });
    } catch (err) {
       res.status(500).json({ success: false, error: err.message });
    }
  },
  async compareText(req, res) {
    const { text } = req.body;
    //const { vectors, dim } = await dlpController.embed([text]);
    const {action, results} = await compareVectors(text);
    try {
      res.json({
        success: true, 
        action, 
        matches: results 
      });
    }catch (err) {
       res.status(500).json({ success: false, error: err.message });
    }
  },

  async  uploadAndDlp(req, res) {
    const { text } = req.body;
    const result = await analyzeTextByRegex(text);
    res.json(result);
  },

 
  // 📌 특정 폴더의 파일을 읽어 텍스트 뽑기
  async  readFolderAndExtract(folderPath) {
    const results = {};
    const files = await fs.promises.readdir(folderPath);
    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stat = await fs.promises.stat(filePath);
      if (stat.isFile()) {
        try {
          const text = await extractText(filePath);
          results[filePath] = text.slice(0, 500) + (text.length > 500 ? '...' : '');
        } catch (err) {
          results[filePath] = `Error: ${err.message}`;
        }
      } else if (stat.isDirectory()) {
        console.log(filePath);
        // 하위 폴더 재귀 처리
        const subResults = await readFolderAndExtract(filePath);
        Object.assign(results, subResults);
      }
    }

    return results;
  },
  
};





module.exports = { dlpController};