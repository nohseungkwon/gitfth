/**
 * DLP(데이터 손실 방지) 텍스트 감지 및 마스킹
 * @param {string} text 원본 텍스트
 * @returns {{result: string, detected: object, status: 'safe'|'danger'}}
 */
function analyzeTextByRegex(text) {
  const detected = createDetectedMap();
  let maskedText = text;

  // 1️⃣ 기본 패턴 감지
  const patterns = getBasicPatterns();
  for (const [key, pattern] of Object.entries(patterns)) {
    const regex = new RegExp(pattern, 'g');
    const matches = text.match(regex);
    if (!matches) continue;

    detected[key] = matches;
    maskedText = maskDetectedText(maskedText, matches);
  }

  // 2️⃣ 한글 주소 감지
  const addressMatches = detectKoreanAddress(text);
  if (addressMatches.length > 0) {
    detected.address = addressMatches;
    maskedText = maskDetectedText(maskedText, addressMatches);
  }

  // 3️⃣ 결과 리턴
  const isSafe = isDetectedEmpty(detected);
  return {
    result: maskedText,
    detected,
    status: isSafe ? 'safe' : 'danger'
  };
}

/** 감지 항목 초기 구조 */
function createDetectedMap() {
  return {
    phone: [],
    email: [],
    ipv4: [],
    ipv6: [],
    ssn: [],
    creditCard: [],
    businessNumber: [],
    bankAccount: [],
    postalCode: [],
    macAddress: [],
    address: []
  };
}

/** 기본 정규식 패턴 정의 */
function getBasicPatterns() {
  return {
    phone: '\\b0\\d{1,2}\\D*\\d{3,4}\\D*\\d{4}\\b',
    email: '\\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z가-힣]{2,}\\b',
    ipv4: '\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b',
    ipv6: '\\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\\b',
    ssn: '\\b\\d{6}\\D*\\d{7}\\b',
    creditCard: '\\b(?:\\d{4}[- ]?){3}\\d{4}\\b',
    businessNumber: '\\b\\d{3}[- ]?\\d{2}[- ]?\\d{5}\\b',
    bankAccount: '\\b\\d{8,14}\\b',
    postalCode: '\\b\\d{5}\\b',
    macAddress: '\\b([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})\\b'
  };
}

/** 한글 주소 감지 */
function detectKoreanAddress(text) {
  const korAddressPattern = [
    // 도로명 주소
    '(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|' +
    '대전광역시|울산광역시|세종특별자치시|경기도|강원도|' +
    '충청북도|충청남도|전라북도|전라남도|경상북도|' +
    '경상남도|제주특별자치도)?' +
    '[\\s\\uAC00-\\uD7A3\\d\\-~.,]{0,20}?' +
    '(시|군|구|읍|면|동|리)' +
    '[\\s\\uAC00-\\uD7A3\\d\\-~.,]{0,30}?' +
    '(로|길|대로|번길|번지|건물|아파트)' +
    '\\s*\\d{1,5}(-\\d{1,5})?',

    // 지번 주소
    '(?:서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|' +
    '대전광역시|울산광역시|세종특별자치시|경기도|강원도|' +
    '충청북도|충청남도|전라북도|전라남도|경상북도|' +
    '경상남도|제주특별자치도)?' +
    '[\\s\\uAC00-\\uD7A3\\d\\-~.,]{0,20}?' +
    '(시|군|구|읍|면|동|리)\\s*\\d{1,5}(-\\d{1,5})?',

    // 축약형 주소
    '[\\uAC00-\\uD7A3]+(로|길|대로|번길)\\s*\\d{1,5}(-\\d{1,5})?.*',
    '[\\uAC00-\\uD7A3]+로\\s*\\d{1,5}'
  ].join('|');

  const korAddressRegex = new RegExp(korAddressPattern, 'g');
  const matches = text.match(korAddressRegex) || [];

  const addressKeywords = ['도','시','군','구','동','읍','면','리','로','길','대로','번지','건물','아파트','호'];

  return matches.filter(addr => {
    let count = 0;
    for (const kw of addressKeywords) {
      if (addr.includes(kw)) count++;
      if (count >= 2) return true;
    }
    return false;
  });
}

/** 감지된 항목 마스킹 */
function maskDetectedText(text, matches) {
  let masked = text;
  for (const match of matches) {
    const escaped = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    masked = masked.replace(new RegExp(escaped, 'g'), '***');
  }
  return masked;
}

/** 감지 항목이 비었는지 여부 */
function isDetectedEmpty(detected) {
  return Object.values(detected).every(arr => Array.isArray(arr) && arr.length === 0);
}

module.exports = { analyzeTextByRegex };
