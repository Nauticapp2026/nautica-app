// Utilidades compartidas para los buscadores del sistema.
//
// `buscarRankeado` filtra y ordena por relevancia:
// - Consulta numérica (ej. "1"): matchea contra el número del ítem —
//   exacto primero, después prefijo (1, 10, 11…) en orden numérico,
//   después "contiene"; los matches de texto van al final.
// - Consulta de texto: prefijo antes que substring; empates en orden
//   alfabético. Insensible a acentos ("perez" matchea "Pérez").
//
// Para tablas con orden propio (cronológico o columnas ordenables) usar solo
// `normalizarBusqueda` para el matching, sin reordenar.

export function normalizarBusqueda(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

type OpcionesBusqueda<T> = {
  // Campos de texto donde buscar; el primero define el orden alfabético.
  textos: (item: T) => (string | null | undefined)[];
  // Número identificatorio (nº de socio, folio) para consultas numéricas.
  numero?: (item: T) => number | null | undefined;
};

export function buscarRankeado<T>(items: T[], query: string, opts: OpcionesBusqueda<T>): T[] {
  const q = normalizarBusqueda(query.trim());
  if (!q) return items;
  const esNumerica = /^\d+$/.test(q);

  const rankeados: { item: T; rank: number; numero: number; texto: string }[] = [];

  for (const item of items) {
    const textos = opts
      .textos(item)
      .filter((t): t is string => Boolean(t))
      .map(normalizarBusqueda);
    const numero = opts.numero?.(item);
    const numeroStr = numero != null ? String(numero) : null;

    let rank = -1;
    if (esNumerica && numeroStr != null) {
      if (numeroStr === q) rank = 0;
      else if (numeroStr.startsWith(q)) rank = 1;
      else if (numeroStr.includes(q)) rank = 2;
    }
    if (rank === -1 && textos.some((t) => t.includes(q))) {
      const esPrefijo = textos.some(
        (t) => t.startsWith(q) || t.split(/\s+/).some((palabra) => palabra.startsWith(q)),
      );
      rank = esPrefijo ? 3 : 4;
    }
    if (rank === -1) continue;

    rankeados.push({
      item,
      rank,
      numero: numero ?? Number.MAX_SAFE_INTEGER,
      texto: textos[0] ?? '',
    });
  }

  rankeados.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.rank <= 2) return a.numero - b.numero;
    return a.texto.localeCompare(b.texto, 'es');
  });

  return rankeados.map((r) => r.item);
}

// Caso común: buscador de socios por nombre, nº de socio o embarcación.
export function buscarSocios<
  T extends { nombre: string; numeroSocio: number | null; embarcaciones: string[] },
>(socios: T[], query: string): T[] {
  return buscarRankeado(socios, query, {
    textos: (s) => [s.nombre, ...s.embarcaciones],
    numero: (s) => s.numeroSocio,
  });
}
