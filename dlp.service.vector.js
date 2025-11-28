const fs = require('fs');
const path = require('path');

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const { pipeline } = require('@xenova/transformers');
const faiss = require('faiss-node');

let extractor;
let _index;
let _fileMap;
async function embed(texts) {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-base');
  }

  const out = await extractor(texts, { pooling: 'mean', normalize: true });
  return {
    vectors: out.data,
    dim: out.dims.at(-1),
    count: texts.length
  };
}

  async function extractText(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.txt') {
      return fs.promises.readFile(filePath, 'utf8');
    }

    if (ext === '.pdf') {
      const data = await fs.promises.readFile(filePath);
      const pdfData = await pdfParse(data);
      return pdfData.text;
    }

    if (ext === '.docx') {
      const data = await fs.promises.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer: data });
      return result.value;
    }
    return ''; // 지원하지 않는 확장자
  }


async function searchFolder(currentPath, callback) {
    const entries = await fs.promises.readdir(currentPath);

    for (const entry of entries) {
        const entryPath = path.join(currentPath, entry);
        let stat;
        try {
            stat = await fs.promises.stat(entryPath);
        } catch (err) {
            console.error(`Error accessing ${entryPath}:`, err.message);
            continue;
        }

        if (stat.isFile()) {
            await callback(entryPath);
        } else if (stat.isDirectory()) {
            await searchFolder(entryPath, callback);
        }
    }
}

async function initDocumentEmbeddings(folderPath) {
    const files = await fs.promises.readdir(folderPath);
    const texts = [];
    const fileMap = [];

    await searchFolder(folderPath, async (filePath) => {
      try {
        const text = await extractText(filePath);
        if (text.trim()) {
          texts.push(text);
          fileMap.push(filePath);
        }
      } catch (err) {
        console.error(`Error reading ${filePath}:`, err.message);
      }
    });

    if (texts.length === 0) {
      throw new Error('No valid documents found');
    }
    
    // 🔥 텍스트를 임베딩
    const { vectors, dim } = await embed(texts);
    // 🔥 FAISS 인덱스 만들기
    const index = new faiss.IndexFlatIP(dim);
    index.add( Array.from(vectors));


    //if (options.savePath) {
  // 저장 시 Float32Array → 일반 배열 변환
  const vectorsArray = Array.from(vectors); // 1차원 배열
  const indexPath = path.join('./dictionary', 'vector_index.json');
  fs.writeFileSync(indexPath, JSON.stringify(vectorsArray, null, 2), 'utf-8');

  // 파일 맵 저장
  const mapPath = path.join('./dictionary', 'file_map.json');
  fs.writeFileSync(mapPath, JSON.stringify(fileMap, null, 2), 'utf-8');

    console.log(`✅ 벡터 저장: ${indexPath}`);
    console.log(`✅ 파일 맵 저장: ${mapPath}`);
    //}


    return { index, fileMap };
}

async function addDocumentEmbeddings(folderPath, saveDir = './dictionary') {
    const existing = await loadVectorIndex(saveDir);

    let texts = [];
    let fileMap = [];
    if (existing) {
      texts = []; // 나중에 추가 문서만 임베딩
      fileMap = [...existing.fileMap];
    }

    await searchFolder(folderPath, async (filePath) => {
      const fileName = path.basename(filePath);
      if (fileName.startsWith('~$')) return;
      if (existing && existing.fileMap.includes(filePath)) return;

      try {
        const text = await extractText(filePath);
        if (text.trim()) {
          texts.push(text);
          fileMap.push(filePath);
        }
      } catch (err) {
        console.error(`Error reading ${filePath}:`, err.message);
      }
    });

    if (!texts.length) return existing || null;

    const { vectors, dim } = await embed(texts);

    _index = existing ? existing.index : new faiss.IndexFlatIP(dim);
    _index.add(Array.from(vectors));

    // 벡터와 파일 맵 다시 저장
    const _vectors = JSON.parse(fs.readFileSync(path.join(saveDir, 'vector_index.json'), 'utf-8'));
    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
    const allVectors = existing ? [..._vectors, ...vectors] : vectors;
    fs.writeFileSync(path.join(saveDir, 'vector_index.json'), JSON.stringify(allVectors, null, 2), 'utf-8');
    fs.writeFileSync(path.join(saveDir, 'file_map.json'), JSON.stringify(fileMap, null, 2), 'utf-8');
    _fileMap = fileMap
    console.log(`✅ 새 문서 추가 완료. 총 문서 수: ${fileMap.length}`);

    return { _index, _fileMap, dim };
  }

  async function loadVectorIndex(saveDir = './dictionary') {
    if (!fs.existsSync(path.join(saveDir, 'vector_index.json'))) return null;
    
    const vectors = JSON.parse(fs.readFileSync(path.join(saveDir, 'vector_index.json'), 'utf-8'));
    _fileMap = JSON.parse(fs.readFileSync(path.join(saveDir, 'file_map.json'), 'utf-8'));
    //const dim = vectors.length;
    const dim = 768
    _index = new faiss.IndexFlatIP(dim);
    _index.add(vectors);

    return { _index, fileMap: _fileMap };
  }
async function compareVectors(text){
    if (!_index) return res.status(500).json({ error: 'Index not initialized yet' });
    const { vectors, dim } = await embed([text]);

         // FAISS 검색 (상위 3개)
    const k = Math.min(3, _index.ntotal());
    const { distances, labels } = _index.search(Array.from(vectors), k);
    const sims = Array.from(distances);
    const matchIdx = Array.from(labels);

        // similarity 계산 및 필터링
    const results = matchIdx.map((i, idx) => {
      let simLevel = sims[idx] < 0.80 ? '안전' : sims[idx] < 0.85 ? '위험' : '심각';
      return { file: _fileMap[i], similarity: simLevel };
    }).filter(r => r.similarity === '위험' || r.similarity === '심각'); // 위험/심각만 남김

    // 판정
    const maxSim = Math.max(...sims);
    let action = 'ALLOW';
    if (maxSim >= 0.85) action = 'BLOCK';
    else if (maxSim >= 0.80) action = 'HOLD_FOR_REVIEW';
    return { action,results }
}




module.exports = { initDocumentEmbeddings , addDocumentEmbeddings, loadVectorIndex, compareVectors};