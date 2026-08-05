import * as XLSX from 'xlsx';

/**
 * Helper to shuffle an array in place (Fisher-Yates)
 */
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate default participants 1..totalCount
 */
export function generateDefaultParticipants(totalCount = 250) {
  const participants = [];
  for (let i = 1; i <= totalCount; i++) {
    participants.push({
      id: i,
      name: `구슬 #${i}`,
      ballNumber: i,
      originalIndex: i
    });
  }
  return participants;
}

/**
 * Parse uploaded Excel or CSV file
 * @param {File} file 
 * @param {number} targetBallCount 
 * @returns {Promise<Array<{id: number, ballNumber: number, name: string}>>}
 */
export async function parseExcelFile(file, targetBallCount = 250) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert worksheet to array of arrays
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!rawJson || rawJson.length === 0) {
          throw new Error('엑셀 파일이 비어있습니다.');
        }

        let nameColIndex = -1;
        let empIdColIndex = -1;
        let startRowIndex = 0;

        // Inspect header row (row 0 or row 1)
        for (let r = 0; r < Math.min(2, rawJson.length); r++) {
          const row = rawJson[r] || [];
          row.forEach((cell, idx) => {
            if (cell !== undefined && cell !== null) {
              const strVal = String(cell).trim();
              if (strVal.includes('이름') || strVal.includes('성명') || strVal.toLowerCase().includes('name') || strVal.includes('참가자')) {
                nameColIndex = idx;
                startRowIndex = r + 1;
              } else if (strVal.includes('사번') || strVal.includes('직번') || strVal.toLowerCase().includes('emp') || strVal.includes('번호') || strVal.toLowerCase().includes('id') || strVal.toLowerCase().includes('no')) {
                empIdColIndex = idx;
              }
            }
          });
          if (nameColIndex !== -1) break;
        }

        // If no explicit header found, default to scanning first non-empty text column
        if (nameColIndex === -1) {
          startRowIndex = 0;
        }

        const rawList = [];

        for (let i = startRowIndex; i < rawJson.length; i++) {
          const row = rawJson[i];
          if (!row || row.length === 0) continue;

          let nameStr = '';
          if (nameColIndex !== -1 && row[nameColIndex] !== undefined && row[nameColIndex] !== null) {
            nameStr = String(row[nameColIndex]).trim();
          }

          // Fallback: if nameStr is empty or equal to '자동배정' or header text, scan row cells
          if (!nameStr || nameStr === '자동배정' || nameStr.includes('이름') || nameStr.includes('성명')) {
            for (let j = 0; j < row.length; j++) {
              const val = String(row[j] || '').trim();
              if (val && val !== '자동배정' && !val.includes('이름') && !val.includes('성명') && !val.includes('구슬 번호')) {
                nameStr = val;
                break;
              }
            }
          }

          // Extract Employee ID if available
          let empIdStr = '';
          if (empIdColIndex !== -1 && empIdColIndex !== nameColIndex && row[empIdColIndex] !== undefined && row[empIdColIndex] !== null) {
            empIdStr = String(row[empIdColIndex]).trim();
            if (empIdStr === '자동배정' || empIdStr.includes('사번') || empIdStr.includes('번호') || empIdStr.includes('비고')) {
              empIdStr = '';
            }
          }

          if (nameStr && nameStr !== '자동배정' && !nameStr.includes('구슬 번호')) {
            const displayName = empIdStr ? `${nameStr} (${empIdStr})` : nameStr;
            rawList.push(displayName);
          }
        }

        if (rawList.length === 0) {
          throw new Error('유효한 참가자 이름(이름/사번)을 엑셀에서 찾지 못했습니다.');
        }

        // Fill up to targetBallCount if needed, or take first targetBallCount
        const finalNames = [];
        for (let i = 0; i < targetBallCount; i++) {
          if (i < rawList.length) {
            finalNames.push(rawList[i]);
          } else {
            finalNames.push(`참가자 ${i + 1}`);
          }
        }

        // Shuffle names randomly to match ball numbers 1..targetBallCount
        const shuffledNames = shuffleArray(finalNames);

        const mappedList = shuffledNames.map((name, index) => ({
          ballNumber: index + 1,
          name: name,
          id: index + 1
        }));

        resolve(mappedList);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Generate and download a sample Excel file (.xlsx) with 250 participants (이름, 사번, 비고)
 */
export function downloadSampleExcel(totalCount = 250) {
  const sampleNames = [
    '김철수', '이영희', '박민수', '정수진', '최재성', '강지훈', '윤서연', '박민준',
    '최지우', '정현우', '한소희', '오동현', '임수빈', '송태양', '배하은', '신재범'
  ];

  const sampleDepts = ['영업팀', '개발팀', '기획팀', '마케팅팀', '경영지원팀', '디자인팀', '인사팀'];

  const sampleData = [];
  for (let i = 1; i <= totalCount; i++) {
    const name = sampleNames[(i - 1) % sampleNames.length] + (i > sampleNames.length ? `_${i}` : '');
    const empId = `S${10000 + i}`;
    const dept = sampleDepts[(i - 1) % sampleDepts.length];

    sampleData.push({
      '이름': name,
      '사번': empId,
      '비고': dept
    });
  }

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '참가자_목록');

  XLSX.writeFile(workbook, '250_샘플.xlsx');
}
