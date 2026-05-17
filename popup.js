// AI Auditor Assistant - Popup v8.0

function setStatus(text, color) {
  var el = document.getElementById('status');
  el.textContent = text;
  el.style.color = color;
  el.style.whiteSpace = 'pre-line';
}

function showMatchedDetails(details) {
  if (!details || details.length === 0) return;
  
  var el = document.getElementById('status');
  var html = '<div style="margin-top: 8px; max-height: 150px; overflow-y: auto; font-size: 10px; background: #f9f9f9; padding: 6px; border-radius: 4px;">';
  html += '<div style="font-weight: bold; margin-bottom: 4px;">Dopasowane pola:</div>';
  
  for (var i = 0; i < Math.min(details.length, 15); i++) {
    var d = details[i];
    var display = d.displayName ? '"' + d.displayName.substring(0, 40) + '"' : '';
    html += '<div style="color: #333;">' + 
      '<span style="color: #0078d4; font-weight: bold;">' + d.jsonKey + '</span> → ' +
      '<span style="color: #666;">' + d.section + '</span> ' + display +
      '<br style="line-height: 1.2;">' +
      '  = "' + d.value.substring(0, 50) + '"</div>';
  }
  
  if (details.length > 15) {
    html += '<div style="color: #999; margin-top: 4px;">... i ' + (details.length - 15) + ' więcej</div>';
  }
  
  html += '</div>';
  el.innerHTML = html;
}

// === Helper: send fillForm with timeout ===
function sendFillForm(tabId, data, callback) {
  var started = false;
  
  function wrapCallback(result) {
    if (started) return;
    started = true;
    callback(result);
  }
  
  chrome.tabs.sendMessage(tabId, { action: 'fillForm', data: data }, function(response) {
    if (chrome.runtime.lastError) {
      wrapCallback({ err: chrome.runtime.lastError.message });
      return;
    }
    if (response) {
      wrapCallback(response);
    } else {
      wrapCallback({ err: 'No response from content script' });
    }
  });
  
  setTimeout(function() {
    wrapCallback({ err: 'Timeout 30s' });
  }, 10000);
}

// === Discover Fields button ===
document.getElementById('discoverBtn').addEventListener('click', function() {
  setStatus('Wyszukiwanie pól formularza...', 'blue');
  
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs || !tabs[0]) {
      setStatus('Nie znaleziono aktywnej karty', 'orange');
      return;
    }
    
    chrome.tabs.sendMessage(tabs[0].id, { action: 'discoverFields' }, function(response) {
      if (chrome.runtime.lastError) {
        setStatus('BŁĄD: ' + chrome.runtime.lastError.message + '\nUpewnij się że jesteś na gwd.nfosigw.gov.pl', 'red');
        console.error('Discover error:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.success) {
        var html = '';
        html += '<div style="font-size: 13px; font-weight: bold; color: #0078d4;">Formularz: ' + response.count + ' pól w ' + response.sections.length + ' sekcjach</div>\n';
        html += '<div style="margin-top: 6px; font-size: 11px;">';
        
        if (response.sections) {
          for (var i = 0; i < response.sections.length; i++) {
            var s = response.sections[i];
            html += '<div>' + s.name + ' (' + s.count + ') — "' + s.firstField + '"</div>';
          }
        }
        
        html += '</div>';
        document.getElementById('status').innerHTML = html;
      } else if (response && response.status === 'ok') {
        // Stara forma odpowiedzi
        var html = '';
        html += '<div style="font-size: 13px; font-weight: bold; color: #0078d4;">Formularz: ' + response.fieldsCount + ' pól w ' + response.sectionsCount + ' sekcjach</div>\n';
        html += '<div style="margin-top: 6px; font-size: 11px;">';
        
        if (response.sectionsSummary) {
          for (var i = 0; i < response.sectionsSummary.length; i++) {
            var s = response.sectionsSummary[i];
            var val = s.firstField.displayName || s.firstField.value || '(puste)';
            if (val.length > 40) val = val.substring(0, 40) + '...';
            html += '<div>' + s.name + ' (' + s.fieldsCount + ') — "' + val + '"</div>';
          }
        }
        
        html += '</div>';
        document.getElementById('status').innerHTML = html;
      } else {
        console.error('Unexpected response:', response);
        setStatus('Nieznana odpowiedź: ' + JSON.stringify(response).substring(0, 200), 'orange');
      }
    });
  });
});

// === Wczytaj plik JSON ===
document.getElementById('fileBtn').addEventListener('click', function() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs || !tabs[0]) {
      setStatus('Nie znaleziono aktywnej karty', 'orange');
      return;
    }
    
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) {
        setStatus('Nie wybrano pliku', 'orange');
        return;
      }
      
      setStatus('Czytanie...', 'blue');
      
      var reader = new FileReader();
      reader.onload = function(event) {
        try {
          var data = JSON.parse(event.target.result);
          setStatus('Wysyłanie ' + Object.keys(data).length + ' pól...', 'blue');
          
          sendFillForm(tabs[0].id, data, function(result) {
            if (result.err) {
              setStatus('BŁĄD: ' + result.err, 'red');
            } else {
              setStatus('✓ Wypełniono ' + (result.filled || 0) + ' pól', 'green');
              showMatchedDetails(result.matched);
            }
          });
        } catch (parseErr) {
          setStatus('Błąd JSON: ' + parseErr.message, 'red');
        }
      };
      reader.readAsText(file);
    };
    
    input.click();
  });
});

// === Wklej JSON i wypełnij ===
document.getElementById('fillBtn').addEventListener('click', function() {
  var jsonText = document.getElementById('jsonData').value.trim();
  
  if (!jsonText) {
    setStatus('Wklej JSON lub użyj przycisku Wczytaj plik', 'orange');
    return;
  }
  
  var data;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    setStatus('Błąd JSON: ' + e.message, 'red');
    return;
  }
  
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs || !tabs[0]) {
      setStatus('Nie znaleziono aktywnej karty', 'red');
      return;
    }
    
    setStatus('Wysyłanie ' + Object.keys(data).length + ' pól...', 'blue');
    
    sendFillForm(tabs[0].id, data, function(result) {
      if (result.err) {
        setStatus('BŁĄD: ' + result.err, 'red');
      } else {
        setStatus('✓ Wypełniono ' + (result.filled || 0) + ' pól', 'green');
        showMatchedDetails(result.matched);
      }
    });
  });
});
