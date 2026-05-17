// AI Auditor v24 - Revert to v21 working structure, minimal fixes
// Fixed: rubryagaNum typo -> rubrykaNum
// Fixed: findRubrykaNumber uses column suffix matching not raw column name

function discoverAllFields() {
  const fields = [];
  const seen = new Set();
  const allFgen = document.querySelectorAll('[id^="fgen-field-"]');
  console.log('[v24] Raw fgen elements: ' + allFgen.length);
  
  if (allFgen.length > 0) {
    console.log('[v24] Sample IDs:');
    for (let i = 0; i < Math.min(5, allFgen.length); i++) {
      console.log('  ' + allFgen[i].id);
    }
  }

  allFgen.forEach(el => {
    const id = el.id;
    if (seen.has(id)) return;
    seen.add(id);

    // Flexible regex: handle fgen-field-Section_RowNNNN_1_ColumnMMMM_Z or similar
    const idMatch = id.match(/^fgen-field-(.+?)_(Row\d+)_(\d+)_(Column\d+)_(\d+)$/);
    if (!idMatch) {
      // Try relaxed pattern
      const relaxed = id.match(/^fgen-field-(.+?)_(Row\d+)_(Column\d+)/);
      if (!relaxed) {
        console.log('[v24] UNMATCHED ID: ' + id);
        return;
      }
      // Extract what we can
      const section = relaxed[1];
      const row = relaxed[2];
      const column = relaxed[3];
      const colNum = parseInt(column.replace('Column', ''));
      const text = (el.textContent || '').trim();
      const disabled = el.disabled;
      const tag = el.tagName.toLowerCase();
      const isHeader = /^\d+[.]?\d*$/.test(text) || /^[A-Z][A-Z ]+$/.test(text) || text.length > 30;
      const isEditable = !text && !disabled;
      fields.push({ id, section, row, column, colNum, tag, text, disabled, isEditable, isHeader, displayName: text });
      return;
    }

    const section = idMatch[1];
    const row = idMatch[2];
    const column = idMatch[4];
    const colNum = parseInt(idMatch[5]);
    const text = (el.textContent || '').trim();
    const disabled = el.disabled;
    const tag = el.tagName.toLowerCase();

    const isHeader = /^\d+[.]?\d*$/.test(text) || /^[A-Z][A-Z ]+$/.test(text) || text.length > 30;
    const isEditable = !text && !disabled;

    fields.push({
      id, section, row, column, colNum,
      tag, text, disabled, isEditable, isHeader,
      displayName: text
    });
  });

  console.log('[AI Auditor v24] Discovered ' + fields.length + ' fields');
  return fields;
}

function stripPolish(s) {
  return String(s).toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
    .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
    .replace(/ś/g, 's').replace(/ż/g, 'z').replace(/ź/g, 'z');
}

function getField(section, row, column) {
  // Format: fgen-field-Section_Row5278_1_Column1037_1
  // Need to try both formats
  const id1 = 'fgen-field-' + section + '_' + row + '_' + column;
  const el1 = document.getElementById(id1);
  if (el1) return el1;
  // Try with extra _1 between row and column
  const id2 = 'fgen-field-' + section + '_' + row + '_1_' + column + '_1';
  const el2 = document.getElementById(id2);
  if (el2) return el2;
  // Try partial match
  for (const f of discoverAllFields()) {
    if (f.section === section && f.row === row && f.column === column) {
      return document.getElementById(f.id);
    }
  }
  return null;
}

function fillField(field, value) {
  if (!value || String(value).trim() === '') return false;
  const s = String(value).trim();
  const el = getField(field.section, field.row, field.column);
  if (!el || el.disabled) return false;

  el.textContent = s;
  const opts = { bubbles: true, cancelable: true };
  ['focus', 'input', 'change', 'blur'].forEach(evt => el.dispatchEvent(new Event(evt, opts)));
  return true;
}

function fillFgenDropdown(field, searchValue) {
  const s = String(searchValue).trim();
  if (!s) return false;

  const el = getField(field.section, field.row, field.column);
  if (!el || el.disabled) return false;

  const input = el.querySelector('input') || el;
  input.focus();
  input.textContent = s;
  
  const kdown = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
  input.dispatchEvent(kdown);

  setTimeout(() => {
    const allOptions = document.querySelectorAll('[role="listbox"] [role="option"], [role="listbox"] li, .ui-autocomplete li, .ui-menu-item');
    let found = null;
    const normS = stripPolish(s);
    for (const opt of allOptions) {
      const optText = (opt.textContent || '').trim();
      if (stripPolish(optText).includes(normS) || normS.includes(stripPolish(optText))) {
        found = opt;
        break;
      }
    }
    if (found) {
      found.focus();
      found.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    } else {
      const first = allOptions[0];
      if (first) {
        first.focus();
        first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      }
    }
  }, 300);

  return true;
}

function getFieldId(section, row, column) {
  return 'fgen-field-' + section + '_' + row + '_' + column;
}

function matchJsonToFields(allFields, data) {
  const mappings = [];
  const unmatched = [];
  const usedFields = new Set();

  const bySection = {};
  for (const f of allFields) {
    if (!bySection[f.section]) bySection[f.section] = [];
    bySection[f.section].push(f);
  }

  // Direct mapping: JSON key -> (section, row, column)
  const directMap = {
    'osoba_sporzadzajaca_imie':       ['DaneOsobySporzadzajacej','Row5279','Column1045'],
    'osoba_sporzadzajaca_nazwisko':   ['DaneOsobySporzadzajacej','Row5279','Column1047'],
    'osoba_sporzadzajaca_nr_wpisu':   ['DaneOsobySporzadzajacej','Row5281','Column1046'],
    'osoba_sporzadzajaca_data_przekazania': ['DaneOsobySporzadzajacej','Row5278','Column1045'],
    'wnioskodawca_imie':              ['DaneOgolneBudynku','Row5284','Column1049'],
    'wnioskodawca_nazwisko':          ['DaneOgolneBudynku','Row5284','Column1051'],
    'adres_wojewodztwo':              ['S3Table86','Row5386','Column1037'],
    'adres_powiat':                   ['S3Table86','Row5386','Column1038'],
    'adres_gmina':                    ['S3Table86','Row5387','Column1037'],
    'adres_miejscowosc':              ['S3Table86','Row5387','Column1038'],
    'adres_ulica':                    ['S3Table86','Row6330','Column1037'],
    'adres_budynek_nr':               ['S3Table86','Row6330','Column1038'],
    'adres_lokal_nr':                 ['S3Table86','Row6330','Column1442'],
    'adres_kod_pocztowy':             ['S3Table86','Row5392','Column1037'],
    'adres_poczta':                   ['S3Table86','Row5392','Column1038'],
    'budynek_powierzchnia_calkowita': ['DaneOgolneBudynku','Row5284','Column1050'],
    'budynek_powierzchnia_regulowana':['DaneOgolneBudynku','Row5284','Column1048'],
    'budynek_kubatura':               ['DaneOgolneBudynku','Row5285','Column1048'],
    'budynek_wsp_av':                 ['DaneOgolneBudynku','Row5285','Column1049'],
    'budynek_rok_budowy':             ['DaneOgolneBudynku','Row5285','Column1047'],
    'radio_wniosek':                  ['ZlezenieKorekta','Row89','Column654'],
    'wersja_formularza':              ['WersjaFormularza','Row1','Column1'],
    'nr_tech':                        ['NrTech','Row1','Column1'],
    'stan_cieplo_ogrzewanie':         ['StanBudynku','Row5286','Column1060'],
    'stan_cieplo_wentylacja':         ['StanBudynku','Row5286','Column1062'],
    'stan_cieplo_cwu':                ['StanBudynku','Row5286','Column1063'],
    'stan_cieplo_klimatyzacja':       ['StanBudynku','Row5286','Column1064'],
    'planowane_termomodernizacja':    ['PlanowanyDoRealizacji','Row6632','Column1460'],
    'planowana_wentylacja_mechaniczna':['SystemWantylacji','Row6642','Column1460'],
    'planowane_ogrzewanie_wymiana':   ['DoOgrzewania','Row6647','Column1462'],
    'planowane_ogrzewanie_nowe_zrodlo':['DoOgrzewania','Row6648','Column1462'],
    'planowane_instalacja_modyfikacja':['InstalacjaCentralnego','Row6653','Column1464'],
    'planowane_instalacja_zakres':    ['InstalacjaCentralnego','Row6654','Column1464'],
    'planowane_kolektory_sloneczne':  ['InstalacjaCentralnego','Row6657','Column1464'],
  };

  for (const [jsonKey, [section, row, column]] of Object.entries(directMap)) {
    const value = data[jsonKey];
    if (!value || String(value).trim() === '') continue;
    const fieldId = getFieldId(section, row, column);
    const field = allFields.find(f => f.id === fieldId);
    if (field) {
      mappings.push({ jsonKey, field, value: String(value).trim() });
      usedFields.add(field.id);
      console.log('[AI Auditor v24] DIRECT ' + jsonKey + ' -> ' + fieldId);
    } else {
      unmatched.push(jsonKey);
      console.log('[AI Auditor v24] NO field for DIRECT ' + jsonKey + ' at ' + fieldId);
    }
  }

  const prefixToSections = {
    'planowana_przegroda_': ['PlanowanyDoRealizacji'],
    'planowane_instalacja_': ['InstalacjaCentralnego', 'PlanowanyDoRealizacji'],
    'emisja_old_': ['EmisjaZanieczyszczen'],
    'emisja_new_': ['EmisjaZanieczyszczen'],
    'emisja_pmi0_old': ['EmisjaZanieczyszczen'],
    'emisja_pmi0_new': ['EmisjaZanieczyszczen'],
    'emisja_bap_old': ['EmisjaZanieczyszczen'],
    'emisja_bap_new': ['EmisjaZanieczyszczen'],
    'emisja_co2_old': ['EmisjaZanieczyszczen'],
    'emisja_co2_new': ['EmisjaZanieczyszczen'],
    'emisja_stare_zrodlo': ['EmisjaZanieczyszczen'],
    'emisja_nowe_zrodlo': ['EmisjaZanieczyszczen'],
    'emisja_wyliczona': ['EmisjaZanieczyszczen'],
    'efekt_ekologiczny_oszczednosc': ['EfektEkologiczny'],
    'efekt_ekologiczny_zmniejszenie': ['EfektEkologiczny'],
    'red_ekologiczny_oszczednosc_energi': ['EfektEkologiczny'],
    'red_ekologiczny_zmniejszenie_emisji': ['EfektEkologiczny'],
    'poprawa_efektywnosc_5_1': ['PoprawaEfektywnosci'],
    'poprawa_efektywnosc_5_2': ['PoprawaEfektywnosci'],
    'poprawa_efektywnosc_5_3': ['PoprawaEfektywnosci'],
    'poprawa_efektywnosc_5_4': ['PoprawaEfektywnosci'],
    'poprawa_efektywnosc_5_5': ['PoprawaEfektywnosci'],
    'poprawa_efektywnosc_5_6': ['PoprawaEfektywnosci'],
    'poprawa_efektywnosc_5_7': ['PoprawaEfektywnosci'],
    'poprawa_efektywnosc_5_8': ['PoprawaEfektywnosci'],
    'poprawa_efektywnosc_5_9': ['PoprawaEfektywnosci'],
    'poprawa_efektywnosc_5_10': ['PoprawaEfektywnosci'],
    'poprawa_efektywnosc_5_11': ['PoprawaEfektywnosci'],
    'poprawa_efektywnosc_5_12': ['PoprawaEfektywnosci'],
    'podsumowanie_wsp_old_eu': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_old_ek': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_old_ep': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_old_cwu_eu': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_old_cwu_ek': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_old_cwu_ep': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_old_chl_eu': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_old_chl_ek': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_old_chl_ep': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_old_suma_eu': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_old_suma_ek': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_old_suma_ep': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_new_eu': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_new_ek': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_new_ep': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_new_cwu_eu': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_new_cwu_ek': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_new_cwu_ep': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_new_chl_eu': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_new_chl_ek': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_new_chl_ep': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_new_suma_eu': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_new_suma_ek': ['PodsumowanieOcenyEnergetycznej'],
    'podsumowanie_wsp_new_suma_ep': ['PodsumowanieOcenyEnergetycznej'],
  };

  const filtered = {};
  for (const [k, v] of Object.entries(data)) {
    if (!v || String(v).trim() === '') continue;
    if (k.startsWith('planowana_przegroda_') || k.startsWith('planowane_instalacja_')) continue;
    if (k === 'wnioskodawca_imie' || k === 'wnioskodawca_nazwisko') continue;
    if (k === 'osoba_sporzadzajaca_imie' || k === 'osoba_sporzadzajaca_nazwisko') continue;
    if (directMap[k]) continue;
    filtered[k] = v;
  }

  for (const [jsonKey, value] of Object.entries(filtered)) {
    const keyLower = jsonKey.toLowerCase();
    const words = keyLower.split('_').filter(w => w.length > 2);
    const realWords = words.filter(w => stripPolish(w).length > 3);

    let bestPrefix = '';
    for (const prefix of Object.keys(prefixToSections)) {
      if (keyLower.startsWith(prefix) && prefix.length > bestPrefix.length) {
        bestPrefix = prefix;
      }
    }

    const targetSections = prefixToSections[bestPrefix] || [];
    const keyWords = jsonKey.split('_');

    for (const section of targetSections) {
      const sectFields = allFields.filter(f => f.section === section && !usedFields.has(f.id) && f.text === '' && !f.disabled);

      for (const field of sectFields) {
        const rubrykaNum = findRubrykaNumber(section, field.row, field.column, allFields);
        if (!rubrykaNum) continue;

        const score = scoreJsonKeyToRubryka(jsonKey, rubrykaNum, keyWords);
        if (score > 0) {
          mappings.push({ jsonKey, field, value: String(value).trim() });
          usedFields.add(field.id);
          console.log('[AI Auditor v24] MATCH ' + jsonKey + ' -> rubryka ' + rubrykaNum + ' (' + section + ' ' + field.row + ' ' + field.column + ') score=' + score);
          break;
        }
      }
    }
    
    const matched = mappings.some(m => m.jsonKey === jsonKey);
    if (!matched) unmatched.push(jsonKey);
  }

  console.log('[AI Auditor v24] Mappings: ' + mappings.length + ', Unmatched: ' + unmatched.length);
  return { mappings, unmatched, allFields };
}

function findRubrykaNumber(section, targetRow, targetColumn, allFields) {
  for (const f of allFields) {
    if (f.section !== section) continue;
    const text = f.text.trim();
    const match = text.match(/^(\d+[.]?\d*)$/);
    if (!match) continue;

    const rubrykaNum = match[1];
    if (f.row === targetRow) return rubrykaNum;
    
    const targetRowNum = parseInt(targetRow.replace('Row', ''));
    const labelRowNum = parseInt(f.row.replace('Row', ''));
    if (Math.abs(targetRowNum - labelRowNum) <= 1) {
      const targetColNum = parseInt(targetColumn.replace('Column', ''));
      const labelColNum = parseInt(f.column.replace('Column', ''));
      if (labelColNum === targetColNum || Math.abs(labelColNum - targetColNum) <= 1) {
        return rubrykaNum;
      }
    }
  }
  return null;
}

function scoreJsonKeyToRubryka(jsonKey, rubrykaNum, words) {
  let score = 0;
  const rubrykaMatch = jsonKey.match(/_(\d+)[_\.](\d+)/);
  if (rubrykaMatch) {
    const mainNum = rubrykaMatch[1];
    const subNum = rubrykaMatch[2];
    if (rubrykaNum === mainNum + '.' + subNum) {
      score += 200;
    } else if (rubrykaNum === mainNum) {
      score += 100;
    }
  }

  const k = jsonKey.toLowerCase();
  if (k.includes('eu')) { score += rubrykaNum.startsWith('5.') ? 50 : 30; }
  if (k.includes('ek')) { score += rubrykaNum.startsWith('5.') ? 50 : 30; }
  if (k.includes('ep')) { score += rubrykaNum.startsWith('5.') ? 50 : 30; }
  if (k.includes('cwu')) { score += rubrykaNum.startsWith('5.') ? 50 : 30; }
  if (k.includes('chl')) { score += rubrykaNum.startsWith('5.') ? 50 : 30; }
  if (k.includes('suma')) { score += rubrykaNum.startsWith('5.') ? 50 : 30; }
  if (k.includes('poprawa')) { score += rubrykaNum.startsWith('5.') ? 100 : 0; }
  if (k.includes('emisja')) { score += rubrykaNum.startsWith('6.') ? 100 : 50; }
  if (k.includes('efekt') || k.includes('red_ekologiczny')) { score += rubrykaNum.startsWith('6.') ? 100 : 50; }

  return score;
}

function fillPrzegrody(data) {
  let filled = 0;
  const przegrody = {};
  for (const [k, v] of Object.entries(data)) {
    if (!k.startsWith('planowana_przegroda_')) continue;
    const parts = k.split('_');
    const num = parts[2];
    const prop = parts[3];
    if (!przegrody[num]) przegrody[num] = {};
    przegrody[num][prop] = v;
  }

  for (const [num, props] of Object.entries(przegrody)) {
    for (const f of discoverAllFields()) {
      if (f.section !== 'PlanowanyDoRealizacji') continue;
      const text = f.text.trim();
      const match = text.match(/^4\.\d+$/);
      if (!match) continue;
      const rubryka = parseFloat(match[1]);
      const expectedRubryka = parseFloat(num);
      if (Math.abs(rubryka - (expectedRubryka + 1)) < 0.5) {
        if (props.nazwa && f.column === 'Column1452') { fillField(f, props.nazwa); filled++; }
        if (props.u_przed && f.column === 'Column1454') { fillField(f, props.u_przed); filled++; }
        if (props.opis && f.column === 'Column1455') { fillField(f, props.opis); filled++; }
        if (props.lambda && f.column === 'Column1456') { fillField(f, props.lambda); filled++; }
        if (props.grubosc && f.column === 'Column1457') { fillField(f, props.grubosc); filled++; }
        if (props.u_po && f.column === 'Column1458') { fillField(f, props.u_po); filled++; }
      }
    }
  }

  return filled;
}

function fillForm(data) {
  if (!data || typeof data !== 'object') {
    return { filled: 0, skipped: 0, errors: ['Invalid data'], matched: [], unmatched: Object.keys(data), allFields: [] };
  }

  const allFields = discoverAllFields();
  console.log('[AI Auditor v24] Filling... fields=' + allFields.length);

  const { mappings, unmatched } = matchJsonToFields(allFields, data);

  let filled = 0, skipped = 0;
  const errors = [];
  const matchedDetails = [];

  for (const { jsonKey, field, value } of mappings) {
    if (jsonKey.startsWith('planowana_przegroda_') || jsonKey.startsWith('planowane_instalacja_')) continue;

    try {
      if (fillField(field, value)) {
        filled++;
        matchedDetails.push({ jsonKey, fieldId: field.id, displayName: field.text, value: value.substring(0, 80) });
        console.log('[AI Auditor v24] OK ' + jsonKey + ' -> "' + value + '"');
      } else {
        skipped++;
        errors.push('Failed: ' + jsonKey);
        console.log('[AI Auditor v24] SKIP ' + jsonKey);
      }
    } catch (err) {
      skipped++;
      errors.push('Exception: ' + jsonKey + ': ' + err.message);
      console.log('[AI Auditor v24] ERR ' + jsonKey + ': ' + err.message);
    }
  }

  const przegrodyFilled = fillPrzegrody(data);
  filled += przegrodyFilled;

  console.log('[AI Auditor v24] DONE: filled=' + filled + ' skipped=' + skipped + ' unmatched=' + unmatched.length);
  if (unmatched.length > 0) console.log('Unmatched:', unmatched);
  if (errors.length > 0) console.log('Errors:', errors);

  return { filled, skipped, errors, matched: matchedDetails, unmatched, allFields };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === 'discoverFields') {
      const allFields = discoverAllFields();
      const bySection = {};
      for (const f of allFields) {
        if (!bySection[f.section]) bySection[f.section] = [];
        bySection[f.section].push(f);
      }
      const summary = Object.entries(bySection).map(([name, fields]) => {
        const first = fields.find(f => f.text) || fields[0];
        return { name, count: fields.length, firstField: first ? (first.text.substring(0, 80) || '(no name)') : '' };
      });
      sendResponse({ success: allFields.length > 0, count: allFields.length, sections: summary });
      return true;
    }
    else if (request.action === 'fillForm') {
      console.log('[AI Auditor v24] fillForm called with ' + Object.keys(request.data).length + ' keys');
      const result = fillForm(request.data);
      sendResponse(result);
      return true;
    }
    else if (request.action === 'testConnection') {
      sendResponse({ status: 'ok', version: '24.0', fields: discoverAllFields().length });
      return true;
    }
  } catch (e) {
    console.log('[AI Auditor] ERROR: ' + e.message);
    sendResponse({ error: e.message, stack: e.stack });
    return true;
  }
});
