/* =========================================================================
   ICEWISE — "Qué cambia": explicación cuantitativa de cada control
   Cada entrada describe qué hace el control y calcula, con el mismo modelo
   físico de la simulación, cómo cambian las magnitudes clave.
   ========================================================================= */
(function () {
  'use strict';
  const { fmt, fmtDuration } = Ice;
  const M = IceModel;
  const AREA = Math.PI * 0.05 * 0.05;          // barrena de 10 cm
  const REF_W = 5;                             // concentración de referencia para los ejemplos (%)
  const drillRate = (pw, w) => 1.2 * (pw / 150) / (1 + w / 3);          // m/h (igual que el motor)
  const holeMass = (d) => M.columnMass(0, d) * AREA;                     // kg por perforación
  const holeIce = (d, w, dry = 0.15) => M.columnMass(Math.min(dry, d), d) * AREA * (w / 100) / (1 - w / 100);
  const batch = (P, extra = {}) => M.run({ ...M.SCENARIOS.intermedio.values, iceWt: REF_W, area: AREA, cycles: 3, depth: 1,
    Pheat: Math.min(P.heaterW, P.solarW), etaH: P.etaH * 100, etaCap: P.etaCap * 100, ...extra });
  const h = (x) => fmtDuration(x);

  function speciesLine(s, T, P, dose) {
    const f = IceSim.ctmi(T, s), nut = P.nutrients / (0.1 + P.nutrients);
    if (s.kind === 'lichen') {
      if (f <= 0) return T < s.Tmin ? 'demasiado frío: latente' : 'demasiado calor: se estresa';
      return `crece ≈ ${fmt(s.mu * f * nut * 24 * 30 * 100, 1)} % al mes (muy lento)`;
    }
    const mu = s.mu * f * nut;
    const death = Math.LN10 / s.D10 * dose;
    if (mu <= 0) return T < s.Tmin ? 'no crece: demasiado frío' : 'no crece: demasiado calor';
    if (death >= mu) return `muere: la radiación pierde el 90 % cada ${h(s.D10 / dose)}`;
    return `se duplica cada ${h(Math.LN2 / (mu - death))}`;
  }

  const DEF = {
    vmax: {
      title: 'Velocidad máxima',
      help: 'Lo rápido que se mueve el rover. Más rápido = llega antes, pero consume más.',
      rows: (P, v) => [['Consumo conduciendo', `${fmt(55 + 25 + 60 + 420 * v, 0)} W`], ['Tiempo para recorrer 300 m', h(300 / v / 3600)]],
      say: (a, b) => b > a ? 'Llegará antes al hielo, pero gasta más energía por segundo y le queda menos margen para volver.'
        : 'Gasta menos por segundo, pero tarda más: pasa más horas en el frío y la calefacción también consume.'
    },
    iceThreshold: {
      title: 'Umbral de hielo para perforar',
      help: 'Cuánto hielo exige el rover antes de perforar. Alto = exigente; bajo = perfora casi cualquier cosa.',
      rows: (P, v, ctx) => {
        const prior = ctx.world.prior; let ok = 0, cand = 0;
        for (const p of prior) if (p > 0.3) { cand++; if (p >= v) ok++; }
        return [['Zonas candidatas que superan el umbral', `${fmt(cand ? ok / cand * 100 : 0, 0)} %`],
          ['Hielo mínimo por perforación', `${fmt(holeIce(P.drillDepth, v), 2)} kg`]];
      },
      say: (a, b) => b > a ? 'Más exigente: descarta zonas pobres. Perforará menos veces, pero cada muestra traerá más hielo y la energía por kg de agua bajará. Si lo subes demasiado, quizá no encuentre ninguna zona.'
        : 'Menos exigente: perforará en zonas pobres. Más perforaciones y más regolito que calentar para poca agua: sube la energía por kg.'
    },
    drillDepth: {
      title: 'Profundidad de perforación',
      help: 'Hasta dónde baja el taladro. Bajo la capa seca está el suelo con hielo.',
      rows: (P, v) => [['Material por perforación', `${fmt(holeMass(v), 1)} kg`], [`Hielo por perforación (${REF_W} %)`, `${fmt(holeIce(v, REF_W), 2)} kg`],
        ['Tiempo por perforación', h(v / drillRate(P.drillPower, REF_W))]],
      say: (a, b) => b > a ? 'Más profundo: atraviesa más capa con hielo y trae más agua por perforación, pero tarda más y llena antes la bodega.'
        : 'Menos profundo: más rápido, pero una parte mayor de la muestra es la capa seca de arriba, sin hielo.'
    },
    drillPower: {
      title: 'Potencia del taladro',
      help: 'Más potencia corta más rápido el suelo congelado.',
      rows: (P, v) => { const t = P.drillDepth / drillRate(v, REF_W); return [['Tiempo por perforación', h(t)], ['Energía por perforación', `${fmt(v * t, 0)} Wh`]]; },
      say: () => 'Perfora más rápido o más lento, pero la energía por perforación casi no cambia: el trabajo de cortar el suelo es el mismo. Lo que cambia es el tiempo dentro del frío.'
    },
    cargoCap: {
      title: 'Capacidad de bodega',
      help: 'Cuántos kg de muestras carga antes de volver a la estación.',
      rows: (P, v) => [['Perforaciones por viaje', `≈ ${Math.max(1, Math.round(v / holeMass(P.drillDepth)))}`], [`Hielo por viaje (${REF_W} %)`, `${fmt(Math.max(1, Math.round(v / holeMass(P.drillDepth))) * holeIce(P.drillDepth, REF_W), 2)} kg`]],
      say: (a, b) => b > a ? 'Hará menos viajes de ida y vuelta, pero pasará más tiempo dentro del cráter y gastará más batería en cada salida.'
        : 'Volverá más a menudo: más seguro para la batería, pero más kilómetros recorridos solo para ir y volver.'
    },
    reserve: {
      title: 'Reserva de batería',
      help: 'Energía que el rover guarda siempre para poder volver a la luz.',
      rows: (P, v, ctx) => [['Vuelve cuando le queden al menos', `${fmt(ctx.rover.cap * v / 100, 0)} Wh + el camino`]],
      say: (a, b) => b < 10 ? 'Peligro: casi sin reserva, un rodeo o una perforación larga pueden dejarlo sin energía dentro del cráter, donde no hay sol para recargar.'
        : b > a ? 'Más prudente: vuelve antes y con más margen, pero hace menos trabajo en cada salida.' : 'Más arriesgado: aprovecha más cada salida, con menos margen de error.'
    },
    heaterW: {
      title: 'Potencia del horno',
      help: 'Calor para convertir el hielo de las muestras en vapor. Limitada por los paneles solares.',
      rows: (P, v) => { const r = batch({ ...P, heaterW: v }); return [['Potencia que llega al horno', `${fmt(Math.min(v, P.solarW), 0)} W`], ['Tiempo para un lote de ~45 kg', h(r.time.hours)]]; },
      say: (a, b, P) => b > P.solarW ? 'La estación no tiene tanta energía solar: el horno no puede pasar de lo que dan los paneles.'
        : b > a ? 'Los lotes se procesan antes. La energía total por kg de agua es la misma: solo va más rápido.' : 'Más lento: las muestras esperan más en cola.'
    },
    etaH: {
      title: 'Eficiencia de calentamiento',
      help: 'Qué parte del calor llega de verdad a la muestra (el resto se pierde por radiación).',
      rows: (P, v) => { const r = batch({ ...P, etaH: v }); return [['Energía por kg de agua', `${fmt(r.specific, 1)} kWh/kg`], ['Tiempo por lote', h(r.time.hours)]]; },
      say: (a, b) => b > a ? 'Menos calor desperdiciado: cada kg de agua cuesta menos energía y los lotes van más rápido.' : 'Se pierde más calor: el agua sale más cara en energía.'
    },
    etaCap: {
      title: 'Captura de vapor',
      help: 'Qué parte del vapor se congela en la trampa fría en vez de escaparse.',
      rows: (P, v) => [['Agua obtenida por kg de hielo', `${fmt(v * 0.92, 2)} kg`], ['Energía por kg de agua', `${fmt(batch({ ...P, etaCap: v }).specific, 1)} kWh/kg`]],
      say: (a, b) => b > a ? 'Se escapa menos vapor: más agua con la misma energía.' : 'Se escapa más vapor: se pierde agua que ya costó energía sublimar.'
    },
    solarW: {
      title: 'Paneles solares de la estación',
      help: 'Energía disponible en la cresta iluminada para el horno, la carga del rover y la cámara biológica.',
      rows: (P, v) => [['Disponible para el horno (con el rover cargando)', `${fmt(Math.max(0, v - 450 - 30), 0)} W`]],
      say: (a, b) => b > a ? 'Más energía: el horno puede trabajar a más potencia mientras el rover se recarga.' : 'Menos energía: horno y rover compiten. Mira el reparto en la pestaña Planta.'
    },
    Tc: {
      title: 'Temperatura de la cámara',
      help: 'Cada organismo tiene un rango de temperatura en el que crece.',
      rows: (P, v, ctx) => ctx.species.map(s => [s.name, speciesLine(s, v, P, P.dose)]),
      say: (a, b) => b < 0 ? 'Bajo cero el agua se congela: las bacterias dejan de crecer y el biofiltro deja de limpiar.' : b > 38 ? 'Demasiado calor para estas especies: empiezan a morir y el biofiltro pierde eficacia.' : b < 10 ? 'Por debajo de 10 °C Deinococcus se detiene: el mercurio ya no se elimina en el biofiltro.' : 'Cada especie responde distinto. Si una deja de crecer, su parte de la limpieza baja.'
    },
    feed: {
      title: 'Agua del tanque a la cámara',
      help: 'Agua limpia para mantener húmedo el biofiltro entre lotes. Se resta del tanque.',
      rows: (P, v) => [['Agua que sale del tanque al día', `${fmt(v * 24 / 1000, 3)} kg`]],
      say: (a, b) => b === 0 ? 'Sin aporte, la cámara se irá secando. P. extremorientalis muere con la sequedad; Deinococcus la resiste mucho mejor.'
        : 'Mantiene vivo el biofiltro entre lotes. Es poca agua comparada con la que ayuda a limpiar.'
    },
    dose: {
      title: 'Radiación',
      help: 'En la superficie lunar hay ≈ 13 µGy/h. Los valores altos simulan una fuente de laboratorio.',
      rows: (P, v, ctx) => ctx.species.map(s => [s.name, `pierde el 90 % cada ${h(s.D10 / v)}`]),
      say: () => 'Deinococcus repara su ADN muy bien (resistió más de 10 kGy en su descripción original). Pseudomonas es mucho más sensible: si muere, el amoníaco y los orgánicos dejan de eliminarse.'
    },
    nutrients: {
      title: 'Nutrientes',
      help: 'Alimento inicial de las bacterias. El amoníaco y el metanol del agua sucia también las alimentan.',
      rows: (P, v) => [['Velocidad de crecimiento posible', `${fmt(v / (0.1 + v) * 100, 0)} % del máximo`]],
      say: (a, b) => b < 0.1 ? 'Sin nutrientes las bacterias no pueden multiplicarse, aunque la temperatura sea buena.' : 'Con más alimento crecen más rápido, hasta que la población satura la cámara.'
    },
    bioPurif: {
      title: 'Biofiltro',
      help: 'Las bacterias limpian el agua antes de los filtros químicos, que vienen de la Tierra y se gastan.',
      rows: (P, v) => [['Contaminantes que llegan a los filtros (bacterias activas)', v ? '≈ 20–60 de 100' : '100 de 100'], ['Adsorbente gastado por kg de agua', v ? '≈ 0,05–0,15 kg' : '0,25 kg']],
      say: (a, b) => b ? 'Las bacterias se comen el amoníaco y los compuestos orgánicos, y Deinococcus inmoviliza el mercurio. Los filtros químicos duran varias veces más.'
        : 'Sin biofiltro, todo lo limpian los filtros químicos. Se gastan rápido y, cuando se acaban, el agua sale contaminada. Mira el adsorbente restante.'
    },
    chamber: {
      title: 'Ubicación de la cámara',
      help: 'Protegida: temperatura y agua controladas. Exterior: vacío, frío y radiación lunar.',
      rows: (P, v) => [['Temperatura', v === 'outside' ? '≈ −40 °C' : `${fmt(P.Tc, 0)} °C`], ['Agua líquida', v === 'outside' ? 'No: el vacío la evapora' : 'Sí']],
      say: (a, b) => b === 'outside' ? 'En el exterior no hay agua líquida ni aire: las bacterias dejan de crecer, el biofiltro deja de limpiar y los filtros químicos se gastan más rápido. Por eso el biofiltro va dentro de la estación, sellado.' : 'De vuelta a la cámara protegida: si sobrevivieron, vuelven a crecer y a limpiar el agua.'
    }
  };

  function explain(key, before, after, ctx) {
    const d = DEF[key]; if (!d) return null;
    const Pb = { ...ctx.P, [key]: before }, Pa = { ...ctx.P, [key]: after };
    const rb = d.rows(Pb, before, ctx), ra = d.rows(Pa, after, ctx);
    return { title: d.title, text: d.say(before, after, Pa), rows: ra.map((r, i) => [r[0], rb[i] ? rb[i][1] : '—', r[1]]) };
  }
  window.IceExplain = { explain, help: k => (DEF[k] || {}).help || '', DEF };
})();
