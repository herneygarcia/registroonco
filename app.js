// RegistroOnco — lógica principal

// ── Estado global ──────────────────────────────────────────────
let estado = {
  patologiaActual: 'pene',
  registros: [],
  grabando: false,
  recognition: null,
  transcripcion: '',
  procesando: false,
  idioma: localStorage.getItem('registroOnco_idioma') || 'en',
};

// ── Persistencia ───────────────────────────────────────────────
function guardarRegistros() {
  localStorage.setItem('registroOnco_datos', JSON.stringify(estado.registros));
}

function cargarRegistros() {
  try {
    const raw = localStorage.getItem('registroOnco_datos');
    if (raw) estado.registros = JSON.parse(raw);
  } catch { estado.registros = []; }
}

function obtenerApiKey() {
  return localStorage.getItem('registroOnco_apikey') || '';
}

function guardarApiKey(key) {
  localStorage.setItem('registroOnco_apikey', key);
}

function obtenerProveedor() {
  return localStorage.getItem('registroOnco_proveedor') || 'gemini';
}

function guardarProveedor(p) {
  localStorage.setItem('registroOnco_proveedor', p);
}

const DRIVE_URL_ACTUAL = 'https://script.google.com/macros/s/AKfycbzpUWowlbFeVi8VEZHj0_70l1vlQiPyIJRt6tG2uLq2nreREeqU4HFPIw9TrzmeS2SY/exec';
const DRIVE_URL_ANTIGUA = 'https://script.google.com/macros/s/AKfycbzNqCH_xY2eYUUIJP3blp5GfxsDfuCElhnI2bShc_XbUm57O6rofPBWVsIx4o_SguzMhg/exec';

function obtenerDriveUrl() {
  const guardada = localStorage.getItem('registroOnco_driveurl');
  if (guardada === DRIVE_URL_ANTIGUA) {
    localStorage.setItem('registroOnco_driveurl', DRIVE_URL_ACTUAL);
    return DRIVE_URL_ACTUAL;
  }
  return guardada || DRIVE_URL_ACTUAL;
}

function guardarDriveUrl(url) {
  localStorage.setItem('registroOnco_driveurl', url);
}

// ── Toast notifications ────────────────────────────────────────
function mostrarToast(msg, tipo = 'info', duracion = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duracion);
}

// ── Selector de patología ──────────────────────────────────────
function seleccionarPatologia(id) {
  estado.patologiaActual = id;
  document.querySelectorAll('.tumor-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.id === id);
  });
  renderizarFormulario();
  actualizarTabla();
  limpiarTranscripcion();
}

// ── Formulario dinámico ────────────────────────────────────────
function renderizarFormulario(datosExtraidos = {}) {
  const plantilla = PLANTILLAS[estado.patologiaActual];
  const container = document.getElementById('form-fields');
  container.innerHTML = '';

  // Título de la patología seleccionada
  document.getElementById('form-title').textContent = `${t('Nuevo registro')} — ${t(plantilla.nombre)}`;
  document.getElementById('form-title').style.borderLeft = `4px solid ${plantilla.color}`;

  plantilla.campos.forEach(campo => {
    const div = document.createElement('div');
    div.className = 'field-group';

    const valor = datosExtraidos[campo.id] ?? campo.default ?? '';

    if (campo.tipo === 'boolean') {
      div.classList.add('boolean-field');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `f_${campo.id}`;
      cb.name = campo.id;
      cb.checked = valor === true || valor === 'Sí' || valor === 'sí' || valor === 'si' || valor === true;
      const lbl = document.createElement('label');
      lbl.htmlFor = `f_${campo.id}`;
      lbl.textContent = t(campo.label);
      div.appendChild(cb);
      div.appendChild(lbl);
    } else if (campo.tipo === 'textarea') {
      div.classList.add('full-width');
      const lbl = document.createElement('label');
      lbl.htmlFor = `f_${campo.id}`;
      lbl.textContent = t(campo.label);
      const ta = document.createElement('textarea');
      ta.id = `f_${campo.id}`;
      ta.name = campo.id;
      ta.value = valor || '';
      if (valor) ta.classList.add('field-filled');
      div.appendChild(lbl);
      div.appendChild(ta);
    } else if (campo.tipo === 'select') {
      const lbl = document.createElement('label');
      lbl.htmlFor = `f_${campo.id}`;
      lbl.textContent = t(campo.label);
      const sel = document.createElement('select');
      sel.id = `f_${campo.id}`;
      sel.name = campo.id;
      const optVacio = document.createElement('option');
      optVacio.value = '';
      optVacio.textContent = t('— Seleccionar —');
      sel.appendChild(optVacio);
      (campo.opciones || []).forEach(op => {
        const opt = document.createElement('option');
        opt.value = op;
        opt.textContent = t(op);
        if (valor && normalizarTexto(valor) === normalizarTexto(op)) {
          opt.selected = true;
          sel.classList.add('field-filled');
        }
        sel.appendChild(opt);
      });
      div.appendChild(lbl);
      div.appendChild(sel);
    } else {
      const lbl = document.createElement('label');
      lbl.htmlFor = `f_${campo.id}`;
      lbl.textContent = t(campo.label);
      const inp = document.createElement('input');
      inp.type = campo.tipo === 'number' ? 'number' : campo.tipo === 'date' ? 'date' : 'text';
      inp.id = `f_${campo.id}`;
      inp.name = campo.id;
      inp.value = valor || '';
      if (campo.id === 'fecha_registro') inp.value = inp.value || new Date().toISOString().split('T')[0];
      if (valor) inp.classList.add('field-filled');
      div.appendChild(lbl);
      div.appendChild(inp);
    }

    container.appendChild(div);
  });
}

function normalizarTexto(t) {
  return String(t).toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function leerFormulario() {
  const plantilla = PLANTILLAS[estado.patologiaActual];
  const datos = {
    _patologia: estado.patologiaActual,
    _patologiaNombre: plantilla.nombre,
    _id: Date.now(),
  };
  plantilla.campos.forEach(campo => {
    const el = document.getElementById(`f_${campo.id}`);
    if (!el) return;
    if (campo.tipo === 'boolean') {
      datos[campo.id] = el.checked;
    } else if (campo.tipo === 'number') {
      datos[campo.id] = el.value !== '' ? parseFloat(el.value) : null;
    } else {
      datos[campo.id] = el.value || null;
    }
  });
  return datos;
}

function limpiarFormulario() {
  renderizarFormulario();
  limpiarTranscripcion();
}

// ── Tabla de registros ─────────────────────────────────────────
function actualizarTabla() {
  const regsPatologia = estado.registros.filter(r => r._patologia === estado.patologiaActual);
  const tbody = document.getElementById('tabla-body');
  const countEl = document.getElementById('registros-count');
  countEl.textContent = t('{n} registro(s)').replace('{n}', regsPatologia.length);

  if (regsPatologia.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty">${t('No hay registros para esta patología todavía.')}</td></tr>`;
    return;
  }

  tbody.innerHTML = regsPatologia.map(r => `
    <tr>
      <td>${r.historia_clinica || '—'}</td>
      <td>${r.nombre || '—'}</td>
      <td>${r.edad ?? '—'}</td>
      <td>${r.fecha_diagnostico || '—'}</td>
      <td>${r.tnm_t || '—'} ${r.tnm_n || ''} ${r.tnm_m || ''}</td>
      <td>${t(r.procedimiento || '—')}</td>
      <td>${t(r.estado_actual || '—')}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="editarRegistro(${r._id})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="eliminarRegistro(${r._id})">🗑</button>
      </td>
    </tr>
  `).join('');
}

function agregarRegistro() {
  const datos = leerFormulario();
  if (!datos.nombre && !datos.historia_clinica) {
    mostrarToast(t('Ingrese al menos el nombre o la historia clínica del paciente.'), 'error');
    return;
  }
  estado.registros.push(datos);
  guardarRegistros();
  actualizarTabla();
  limpiarFormulario();
  mostrarToast(t('Registro guardado correctamente.'), 'success');
}

function editarRegistro(id) {
  const reg = estado.registros.find(r => r._id === id);
  if (!reg) return;
  seleccionarPatologia(reg._patologia);
  setTimeout(() => renderizarFormulario(reg), 50);
  // Reemplazar al confirmar
  document.getElementById('btn-guardar').onclick = () => {
    const idx = estado.registros.findIndex(r => r._id === id);
    if (idx !== -1) {
      estado.registros[idx] = { ...leerFormulario(), _id: id };
      guardarRegistros();
      actualizarTabla();
      limpiarFormulario();
      mostrarToast(t('Registro actualizado.'), 'success');
    }
    document.getElementById('btn-guardar').onclick = agregarRegistro;
  };
  document.getElementById('btn-guardar').textContent = t('💾 Actualizar registro');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function eliminarRegistro(id) {
  if (!confirm(t('¿Eliminar este registro permanentemente?'))) return;
  estado.registros = estado.registros.filter(r => r._id !== id);
  guardarRegistros();
  actualizarTabla();
  mostrarToast(t('Registro eliminado.'), 'info');
}

// ── Reconocimiento de voz ──────────────────────────────────────
function inicializarVoz() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    document.getElementById('mic-btn').disabled = true;
    document.getElementById('mic-label').textContent = t('Reconocimiento de voz no disponible en este navegador. Use Chrome.');
    return;
  }

  const rec = new SpeechRecognition();
  rec.lang = estado.idioma === 'en' ? 'en-US' : 'es-CO';
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (e) => {
    let finalText = '';
    let interimText = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t + ' ';
      else interimText += t;
    }
    if (finalText) estado.transcripcion += finalText;
    actualizarTranscripcion(estado.transcripcion + interimText);
  };

  rec.onerror = (e) => {
    if (e.error !== 'aborted') mostrarToast(t('Error de micrófono: {error}').replace('{error}', e.error), 'error');
    detenerGrabacion();
  };

  rec.onend = () => {
    if (estado.grabando) rec.start(); // reconectar si sigue activo
  };

  estado.recognition = rec;
}

function toggleGrabacion() {
  if (estado.grabando) detenerGrabacion();
  else iniciarGrabacion();
}

function iniciarGrabacion() {
  if (!estado.recognition) { mostrarToast(t('Reconocimiento de voz no disponible.'), 'error'); return; }
  estado.recognition.lang = estado.idioma === 'en' ? 'en-US' : 'es-CO';
  estado.transcripcion = '';
  estado.grabando = true;
  estado.recognition.start();
  const btn = document.getElementById('mic-btn');
  btn.classList.add('recording');
  btn.innerHTML = '⏹';
  document.getElementById('mic-label').textContent = t('Grabando... hable ahora. Presione para detener.');
  document.getElementById('transcripcion').textContent = '';
  document.getElementById('transcripcion').classList.remove('has-text');
}

function detenerGrabacion() {
  estado.grabando = false;
  if (estado.recognition) estado.recognition.stop();
  const btn = document.getElementById('mic-btn');
  btn.classList.remove('recording');
  btn.innerHTML = '🎙';
  document.getElementById('mic-label').textContent = t('Presione el micrófono y dicte la información del paciente.');

  // Rescatar texto interim visible si estado.transcripcion está vacío
  const textoDOM = document.getElementById('transcripcion').textContent.trim();
  if (!estado.transcripcion.trim() && textoDOM) {
    estado.transcripcion = textoDOM;
  }

  if (estado.transcripcion.trim()) {
    document.getElementById('extract-btn').style.display = 'block';
    mostrarToast(t('Dictado finalizado. Revise el texto y extraiga los campos.'), 'info');
  }
}

function actualizarTranscripcion(texto) {
  const el = document.getElementById('transcripcion');
  el.textContent = texto;
  el.classList.toggle('has-text', texto.trim().length > 0);
}

function limpiarTranscripcion() {
  estado.transcripcion = '';
  const el = document.getElementById('transcripcion');
  el.textContent = '';
  el.classList.remove('has-text');
  document.getElementById('extract-btn').style.display = 'none';
}

// ── Extracción con IA ─────────────────────────────────────────
function construirPrompt(texto) {
  const plantilla = PLANTILLAS[estado.patologiaActual];
  const camposDesc = plantilla.campos.map(c => {
    let desc = `"${c.id}": (${c.tipo})`;
    if (c.opciones) desc += ` opciones válidas: [${c.opciones.join(', ')}]`;
    return desc;
  }).join('\n');

  return `Eres un asistente médico especializado en urología oncológica. Analiza el siguiente dictado médico y extrae los datos del paciente. El dictado puede estar en español o en inglés — detecta el idioma automáticamente.

Devuelve ÚNICAMENTE un objeto JSON válido con los campos listados. Para cada campo de tipo "select", el valor debe ser EXACTAMENTE una de las "opciones válidas" listadas (que están en español), sin importar en qué idioma esté el dictado — traduce el término dictado en inglés a la opción española correspondiente. Para campos no mencionados usa null. Interpreta abreviaciones médicas (HPB=hiperplasia prostática benigna, TAC=tomografía axial computarizada, Dx=diagnóstico, etc.) en ambos idiomas. Si se menciona "sin alteraciones"/"no abnormalities" en imágenes, usa ese valor exacto en español. Para fechas usa formato YYYY-MM-DD si es posible.

Campos esperados para patología "${plantilla.nombre}":
${camposDesc}

Dictado médico:
"${texto}"

Responde solo con el JSON, sin explicaciones ni markdown.`;
}

async function extraerConGemini(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!resp.ok) {
    const err = await resp.json();
    const msg = err.error?.message || '';
    if (msg.includes('limit: 0') || msg.includes('quota') || msg.includes('Quota')) {
      throw new Error(t('⚠️ Su API key no tiene acceso gratuito. Debe obtenerla desde aistudio.google.com → "Get API key" → "Create API key". NO use Google Cloud Console.'));
    }
    throw new Error(msg || `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.candidates[0].content.parts[0].text.trim();
}

async function extraerConGroq(apiKey, prompt) {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      temperature: 0.1
    })
  });
  if (!resp.ok) {
    const e = await resp.json();
    throw new Error(e.error?.message || `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.choices[0].message.content.trim();
}

async function extraerConClaude(apiKey, prompt) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error?.message || `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.content[0].text.trim();
}

async function extraerCampos() {
  const texto = estado.transcripcion.trim() || document.getElementById('transcripcion').textContent.trim();
  if (!texto) { mostrarToast(t('No hay texto para procesar.'), 'error'); return; }

  const prompt = construirPrompt(texto);
  const apiKey = obtenerApiKey();
  const proveedor = obtenerProveedor();

  const btn = document.getElementById('extract-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> ' + t('Procesando');
  estado.procesando = true;

  try {
    let rawJson;

    // Prioridad 1: Si el usuario tiene una clave local, usar el proveedor directo
    if (apiKey) {
      rawJson = proveedor === 'gemini'
        ? await extraerConGemini(apiKey, prompt)
        : proveedor === 'groq'
        ? await extraerConGroq(apiKey, prompt)
        : await extraerConClaude(apiKey, prompt);
    } else {
      // Prioridad 2: Intentar el proxy via Apps Script
      const driveUrl = obtenerDriveUrl();
      if (!driveUrl) {
        throw new Error(t('Sin API key ni URL de Drive configurada. Configure en ⚙️ Configuración.'));
      }

      const respProxy = await fetch(driveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ accion: 'extraer', prompt })
      });

      if (!respProxy.ok) {
        throw new Error(`HTTP ${respProxy.status} desde servidor`);
      }

      const dataProxy = await respProxy.json();
      if (!dataProxy.ok) {
        throw new Error(dataProxy.error || 'Error desconocido del servidor');
      }

      rawJson = dataProxy.texto;
    }

    const jsonStr = rawJson.startsWith('{') ? rawJson : rawJson.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) throw new Error(t('La respuesta no contiene JSON válido.'));

    const extraido = JSON.parse(jsonStr);
    renderizarFormulario(extraido);
    mostrarToast(t('Campos extraídos. Revise y confirme antes de guardar.'), 'success');

  } catch (err) {
    console.error(err);
    mostrarToast(t('Error al procesar: {msg}').replace('{msg}', err.message), 'error');
    renderizarFormulario({ observaciones: texto });
  } finally {
    btn.disabled = false;
    btn.innerHTML = t('✨ Extraer campos con IA');
    estado.procesando = false;
  }
}

// ── Subir a Drive ─────────────────────────────────────────────
async function subirAlDrive() {
  const url = obtenerDriveUrl();
  if (!url) {
    mostrarToast(t('Configure primero la URL del script en ⚙️ Configuración.'), 'error');
    return;
  }
  if (estado.registros.length === 0) {
    mostrarToast(t('No hay registros para subir.'), 'error');
    return;
  }

  const camposPorPatologia = {};
  estado.registros.forEach(r => {
    if (!camposPorPatologia[r._patologia]) {
      const plantilla = PLANTILLAS[r._patologia];
      if (plantilla) {
        camposPorPatologia[r._patologia] = {
          nombre: plantilla.nombre,
          campos: plantilla.campos.map(c => ({ id: c.id, label: c.label }))
        };
      }
    }
  });

  const btn = document.getElementById('btn-subir-drive');
  btn.disabled = true;
  btn.textContent = '⏳ ' + t('Subiendo');
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ registros: estado.registros, camposPorPatologia })
    });
    const data = await resp.json();
    if (data.ok) mostrarToast(t('{n} registro(s) subidos a Drive.').replace('{n}', data.escritos), 'success');
    else throw new Error(data.error);
  } catch (err) {
    mostrarToast(t('Error al subir: {msg}').replace('{msg}', err.message), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('☁️ Subir a Drive');
  }
}

// ── Cargar desde Drive ────────────────────────────────────────
async function cargarDesdeDrive() {
  const url = obtenerDriveUrl();
  if (!url) {
    mostrarToast(t('Configure primero la URL del script en ⚙️ Configuración.'), 'error');
    return;
  }
  const btn = document.getElementById('btn-cargar-drive');
  btn.disabled = true;
  btn.textContent = '⏳ ' + t('Cargando');
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error);
    // Mapa inverso: nombre legible → key interno (ej. "Cáncer de Vejiga" → "vejiga")
    const nombreAKey = {};
    Object.entries(PLANTILLAS).forEach(([k, p]) => { nombreAKey[p.nombre] = k; });

    const mapaLocal = {};
    estado.registros.forEach(r => { mapaLocal[String(r._id)] = r; });
    let importados = 0;
    data.registros.forEach(r => {
      if (!r._id) return;
      // Resolver _patologia: key directo o nombre legible de hoja
      let patKey = r._patologia;
      if (!patKey || !PLANTILLAS[patKey]) patKey = nombreAKey[r._patologia];
      if (!patKey || !PLANTILLAS[patKey]) patKey = nombreAKey[r._hoja];
      if (!patKey) return;

      // Construir mapa label→id para esta patología
      const labelAId = {};
      PLANTILLAS[patKey].campos.forEach(c => { labelAId[c.label] = c.id; });

      // Reconvertir claves de label a id (soporta headers bilingües como "Nombre / Full Name")
      const reg = { _id: Number(r._id) || r._id, _patologia: patKey };
      Object.entries(r).forEach(([k, v]) => {
        if (k.startsWith('_')) return;
        const labelEs = k.split(' / ')[0]; // Extrae la parte español si es bilingual
        const id = labelAId[labelEs];
        if (id) reg[id] = v;
      });

      mapaLocal[String(reg._id)] = reg;
      importados++;
    });
    estado.registros = Object.values(mapaLocal);
    guardarRegistros();
    actualizarTabla();
    mostrarToast(t('{n} registro(s) cargados desde Drive.').replace('{n}', importados), 'success');
  } catch (err) {
    mostrarToast(t('Error al cargar: {msg}').replace('{msg}', err.message), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('📥 Cargar desde Drive');
  }
}

// ── Configuración ──────────────────────────────────────────────
function actualizarModo() {
  const key = obtenerApiKey();
  const proveedor = obtenerProveedor();
  const driveUrl = obtenerDriveUrl();
  const badge = document.getElementById('mode-badge');

  if (key) {
    // Usuario con clave local — usar proveedor directo
    if (proveedor === 'groq') {
      badge.textContent = t('🆓 Groq (gratuito)');
      badge.className = 'mode-badge ia';
    } else if (proveedor === 'gemini') {
      badge.textContent = t('🆓 Gemini (gratuito)');
      badge.className = 'mode-badge ia';
    } else {
      badge.textContent = t('🤖 Claude IA');
      badge.className = 'mode-badge ia';
    }
  } else if (driveUrl) {
    // Sin clave local, pero proxy disponible — IA compartida
    badge.textContent = t('🤖 Groq (compartida)');
    badge.className = 'mode-badge ia';
  } else {
    // Sin clave ni proxy — modo manual
    badge.textContent = t('✋ Modo manual');
    badge.className = 'mode-badge manual';
  }
}

function abrirConfiguracion() {
  document.getElementById('modal-config').style.display = 'flex';
  document.getElementById('modal-proveedor').value = obtenerProveedor();
  document.getElementById('modal-api-key').value = obtenerApiKey();
  document.getElementById('modal-drive-url').value = obtenerDriveUrl();
  actualizarAyudaProveedor();
}

function cerrarConfiguracion() {
  document.getElementById('modal-config').style.display = 'none';
}

function actualizarAyudaProveedor() {
  const p = document.getElementById('modal-proveedor').value;
  const ayuda = document.getElementById('ayuda-proveedor');
  const input = document.getElementById('modal-api-key');
  if (p === 'groq') {
    input.placeholder = 'gsk_...';
    ayuda.innerHTML = t('Gratuito. Obtenga su key en console.groq.com → "API Keys" → "Create API Key". No requiere tarjeta de crédito. 14.400 solicitudes/día.');
  } else if (p === 'gemini') {
    input.placeholder = 'AIzaSy...';
    ayuda.innerHTML = t('Gratuito. Obtenga su key en aistudio.google.com → "Get API key" → "Create API key". No requiere tarjeta.') + '<br>' + t('NO use Google Cloud Console — esa key tiene cuota 0 y no funcionará.');
  } else {
    input.placeholder = 'sk-ant-api03-...';
    ayuda.innerHTML = t('De pago. Obtenga su key en console.anthropic.com → "API Keys". Incluye $5 USD de crédito inicial.');
  }
}

function guardarConfiguracion() {
  const key = document.getElementById('modal-api-key').value.trim();
  const proveedor = document.getElementById('modal-proveedor').value;
  const driveUrl = document.getElementById('modal-drive-url').value.trim();
  guardarApiKey(key);
  guardarProveedor(proveedor);
  guardarDriveUrl(driveUrl);
  actualizarModo();
  cerrarConfiguracion();
  if (key) {
    const nombre = proveedor === 'groq' ? 'Groq (gratuito)' : proveedor === 'gemini' ? 'Gemini (gratuito)' : 'Claude IA';
    mostrarToast(t('Configuración guardada. Usando {nombre}.').replace('{nombre}', nombre), 'success');
  } else {
    mostrarToast(t('Configuración guardada. Modo manual activo.'), 'info');
  }
}

// ── Idioma / Traducción ────────────────────────────────────────
function aplicarIdioma(idioma) {
  estado.idioma = idioma;
  localStorage.setItem('registroOnco_idioma', idioma);
  document.documentElement.lang = idioma;

  // Aplicar traducción a elementos con data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const esOriginal = el.dataset.i18n;
    el.textContent = t(esOriginal);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const esOriginal = el.dataset.i18nPlaceholder;
    el.placeholder = t(esOriginal);
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const esOriginal = el.dataset.i18nTitle;
    el.title = t(esOriginal);
  });

  // Actualizar botón de traducción
  const btnTranslate = document.getElementById('btn-translate');
  if (btnTranslate) {
    const label = btnTranslate.querySelector('.btn-label');
    if (label) label.textContent = idioma === 'en' ? 'Español' : 'English';
  }

  // Re-renderizar contenido dinámico
  renderizarFormulario();
  actualizarTabla();
  actualizarModo();
}

function toggleIdioma() {
  const nuevoIdioma = estado.idioma === 'en' ? 'es' : 'en';
  aplicarIdioma(nuevoIdioma);
}

// ── Inicialización ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  cargarRegistros();
  inicializarVoz();
  seleccionarPatologia('pene');
  actualizarModo();
  aplicarIdioma(estado.idioma);

  document.getElementById('btn-guardar').addEventListener('click', agregarRegistro);
  document.getElementById('btn-limpiar').addEventListener('click', limpiarFormulario);
  document.getElementById('mic-btn').addEventListener('click', toggleGrabacion);
  document.getElementById('extract-btn').addEventListener('click', extraerCampos);

  document.getElementById('btn-export-excel').addEventListener('click', () => exportarExcel(estado.registros));
  document.getElementById('btn-subir-drive').addEventListener('click', subirAlDrive);
  document.getElementById('btn-cargar-drive').addEventListener('click', cargarDesdeDrive);
  document.getElementById('btn-configuracion').addEventListener('click', abrirConfiguracion);
  document.getElementById('btn-modal-close').addEventListener('click', cerrarConfiguracion);
  document.getElementById('btn-modal-guardar').addEventListener('click', guardarConfiguracion);
  document.getElementById('btn-translate').addEventListener('click', toggleIdioma);

  document.getElementById('modal-config').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-config')) cerrarConfiguracion();
  });
});

