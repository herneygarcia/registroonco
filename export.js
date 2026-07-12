// Exportación a Excel usando SheetJS (cargado via CDN en index.html)

function exportarExcel(registros) {
  if (!registros || registros.length === 0) {
    mostrarToast('No hay registros para exportar.', 'error');
    return;
  }

  const wb = XLSX.utils.book_new();

  // Agrupar registros por patología
  const porPatologia = {};
  registros.forEach(r => {
    const key = r._patologia || 'General';
    if (!porPatologia[key]) porPatologia[key] = [];
    porPatologia[key].push(r);
  });

  Object.entries(porPatologia).forEach(([patologia, regs]) => {
    const plantilla = PLANTILLAS[patologia];
    const nombreHoja = plantilla ? plantilla.nombre.substring(0, 31) : patologia;

    // Construir encabezados desde la plantilla
    const campos = plantilla ? plantilla.campos : Object.keys(regs[0]).filter(k => !k.startsWith('_'));
    const encabezados = campos.map(c => typeof c === 'object' ? c.label : c);

    // Construir filas
    const filas = regs.map(reg => {
      return campos.map(c => {
        const id = typeof c === 'object' ? c.id : c;
        const val = reg[id];
        if (val === null || val === undefined) return '';
        if (typeof val === 'boolean') return val ? 'Sí' : 'No';
        return val;
      });
    });

    const datos = [encabezados, ...filas];
    const ws = XLSX.utils.aoa_to_sheet(datos);

    // Estilos de ancho de columna automático
    const colWidths = encabezados.map((h, i) => {
      const maxLen = Math.max(
        h.length,
        ...filas.map(f => String(f[i] || '').length)
      );
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  });

  // Hoja resumen con todos los registros (campos básicos)
  const camposResumen = ['_patologiaNombre', 'nombre', 'historia_clinica', 'edad', 'fecha_diagnostico', 'tnm_t', 'tnm_n', 'tnm_m', 'procedimiento', 'estado_actual', 'proximo_seguimiento'];
  const encResumen = ['Patología', 'Nombre', 'Historia clínica', 'Edad', 'Fecha dx', 'T', 'N', 'M', 'Procedimiento', 'Estado actual', 'Próximo control'];
  const filasResumen = registros.map(r => camposResumen.map(c => r[c] ?? ''));
  const wsResumen = XLSX.utils.aoa_to_sheet([encResumen, ...filasResumen]);
  wsResumen['!cols'] = encResumen.map(h => ({ wch: Math.max(h.length + 2, 15) }));
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  // Descargar
  const fecha = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `registro_oncologia_${fecha}.xlsx`);
  mostrarToast(`Excel exportado: ${registros.length} registro(s)`, 'success');
}

function exportarCSV(registros) {
  if (!registros || registros.length === 0) {
    mostrarToast('No hay registros para exportar.', 'error');
    return;
  }

  // Recopilar todas las claves posibles
  const todasClaves = new Set();
  registros.forEach(r => Object.keys(r).filter(k => !k.startsWith('_')).forEach(k => todasClaves.add(k)));
  const claves = [...todasClaves];

  const lineas = [claves.join(',')];
  registros.forEach(r => {
    const fila = claves.map(k => {
      const v = r[k] ?? '';
      const s = String(v).replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    });
    lineas.push(fila.join(','));
  });

  const blob = new Blob(['﻿' + lineas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `registro_oncologia_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  mostrarToast(`CSV exportado: ${registros.length} registro(s)`, 'success');
}
