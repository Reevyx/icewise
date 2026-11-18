/* =========================================================================
   ICEWISE — "Qué cambia": explicación cuantitativa de cada control
   Cada entrada describe qué hace el control y calcula, con el mismo modelo
   físico de la simulación, cómo cambian las magnitudes clave.
   Textos en español e inglés con L(es, en) (js/i18n.js).
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
  const pc = L(' %', '%');   // espacio antes de % en español

  function speciesLine(s, T, P, dose) {
    const f = IceSim.ctmi(T, s), nut = P.nutrients / (0.1 + P.nutrients);
    if (s.kind === 'lichen') {
      if (f <= 0) return T < s.Tmin ? L('demasiado frío: latente', 'too cold: dormant') : L('demasiado calor: se estresa', 'too hot: stressed');
      return L(`crece ≈ ${fmt(s.mu * f * nut * 24 * 30 * 100, 1)} % al mes (muy lento)`, `grows ≈ ${fmt(s.mu * f * nut * 24 * 30 * 100, 1)}% a month (very slow)`);
    }
    const mu = s.mu * f * nut;
    const death = Math.LN10 / s.D10 * dose;
    if (mu <= 0) return T < s.Tmin ? L('no crece: demasiado frío', 'no growth: too cold') : L('no crece: demasiado calor', 'no growth: too hot');
    if (death >= mu) return L(`muere: la radiación pierde el 90 % cada ${h(s.D10 / dose)}`, `dying: radiation kills 90% every ${h(s.D10 / dose)}`);
    return L(`se duplica cada ${h(Math.LN2 / (mu - death))}`, `doubles every ${h(Math.LN2 / (mu - death))}`);
  }

  const DEF = {
    vmax: {
      title: L('Velocidad máxima', 'Maximum speed'),
      help: L('Lo rápido que se mueve el rover. Más rápido = llega antes, pero consume más. Por defecto 3,6 km/h (supuesto de diseño); como referencia, el rover VIPER de la NASA va a unos 0,8 km/h.',
        'How fast the rover moves. Faster = it arrives sooner, but uses more power. Default 3.6 km/h (design assumption); for reference, NASA\'s VIPER rover moves at about 0.8 km/h.'),
      rows: (P, v) => [[L('Consumo conduciendo', 'Power while driving'), `${fmt(55 + 25 + 60 + 420 * v, 0)} W`], [L('Tiempo para recorrer 300 m', 'Time to cover 300 m'), h(300 / v / 3600)]],
      say: (a, b) => b > a ? L('Llegará antes al hielo, pero gasta más energía por segundo y le queda menos margen para volver.', 'It will reach the ice sooner, but it uses more energy per second and has less margin to return.')
        : L('Gasta menos por segundo, pero tarda más: pasa más horas en el frío y la calefacción también consume.', 'It uses less per second, but takes longer: it spends more hours in the cold, and heating also uses power.')
    },
    iceThreshold: {
      title: L('Umbral de hielo para perforar', 'Ice threshold for drilling'),
      help: L('Cuánto hielo exige el rover antes de perforar. Alto = exigente; bajo = perfora casi cualquier cosa.', 'How much ice the rover requires before drilling. High = demanding; low = it drills almost anything.'),
      rows: (P, v, ctx) => {
        const prior = ctx.world.prior; let ok = 0, cand = 0;
        for (const p of prior) if (p > 0.3) { cand++; if (p >= v) ok++; }
        return [[L('Zonas candidatas que superan el umbral', 'Candidate areas above the threshold'), `${fmt(cand ? ok / cand * 100 : 0, 0)}${pc}`],
          [L('Hielo mínimo por perforación', 'Minimum ice per drill hole'), `${fmt(holeIce(P.drillDepth, v), 2)} kg`]];
      },
      say: (a, b) => b > a ? L('Más exigente: descarta zonas pobres. Perforará menos veces, pero cada muestra traerá más hielo y la energía por litro de agua bajará. Si lo subes demasiado, quizá no encuentre ninguna zona.', 'More demanding: it skips poor areas. It will drill less often, but each sample will bring more ice and the energy per litre of water will drop. Set it too high and it may not find any area.')
        : L('Menos exigente: perforará en zonas pobres. Más perforaciones y más regolito que calentar para poca agua: sube la energía por litro.', 'Less demanding: it will drill in poor areas. More holes and more regolith to heat for little water: the energy per litre goes up.')
    },
    drillDepth: {
      title: L('Profundidad de perforación', 'Drilling depth'),
      help: L('Hasta dónde baja el taladro. Bajo la capa seca está el suelo con hielo.', 'How deep the drill goes. The icy soil lies beneath the dry layer.'),
      rows: (P, v) => [[L('Material por perforación', 'Material per drill hole'), `${fmt(holeMass(v), 1)} kg`], [L(`Hielo por perforación (${REF_W} %)`, `Ice per drill hole (${REF_W}%)`), `${fmt(holeIce(v, REF_W), 2)} kg`],
        [L('Tiempo por perforación', 'Time per drill hole'), h(v / drillRate(P.drillPower, REF_W))]],
      say: (a, b) => b > a ? L('Más profundo: atraviesa más capa con hielo y trae más agua por perforación, pero tarda más y llena antes la bodega.', 'Deeper: it goes through more icy layer and brings more water per hole, but it takes longer and fills the cargo bay sooner.')
        : L('Menos profundo: más rápido, pero una parte mayor de la muestra es la capa seca de arriba, sin hielo.', 'Shallower: faster, but a larger part of the sample is the dry top layer, with no ice.')
    },
    drillPower: {
      title: L('Potencia del taladro', 'Drill power'),
      help: L('Más potencia corta más rápido el suelo congelado.', 'More power cuts through frozen soil faster.'),
      rows: (P, v) => { const t = P.drillDepth / drillRate(v, REF_W); return [[L('Tiempo por perforación', 'Time per drill hole'), h(t)], [L('Energía por perforación', 'Energy per drill hole'), `${fmt(v * t, 0)} Wh`]]; },
      say: () => L('Perfora más rápido o más lento, pero la energía por perforación casi no cambia: el trabajo de cortar el suelo es el mismo. Lo que cambia es el tiempo dentro del frío.', 'It drills faster or slower, but the energy per hole barely changes: the work of cutting the soil is the same. What changes is the time spent in the cold.')
    },
    cargoCap: {
      title: L('Capacidad de bodega', 'Cargo capacity'),
      help: L('Cuántos kg de muestras carga antes de volver a la estación.', 'How many kg of samples it carries before returning to the station.'),
      rows: (P, v) => [[L('Perforaciones por viaje', 'Drill holes per trip'), `≈ ${Math.max(1, Math.round(v / holeMass(P.drillDepth)))}`], [L(`Hielo por viaje (${REF_W} %)`, `Ice per trip (${REF_W}%)`), `${fmt(Math.max(1, Math.round(v / holeMass(P.drillDepth))) * holeIce(P.drillDepth, REF_W), 2)} kg`]],
      say: (a, b) => b > a ? L('Hará menos viajes de ida y vuelta, pero pasará más tiempo dentro del cráter y gastará más batería en cada salida.', 'It will make fewer round trips, but will spend more time inside the crater and use more battery on each outing.')
        : L('Volverá más a menudo: más seguro para la batería, pero más kilómetros recorridos solo para ir y volver.', 'It will return more often: safer for the battery, but more kilometres driven just going back and forth.')
    },
    reserve: {
      title: L('Reserva de batería', 'Battery reserve'),
      help: L('Energía que el rover guarda siempre para poder volver a la luz.', 'Energy the rover always keeps so it can get back to the light.'),
      rows: (P, v, ctx) => [[L('Vuelve cuando le queden al menos', 'It returns when it has at least'), L(`${fmt(ctx.rover.cap * v / 100, 0)} Wh + el camino`, `${fmt(ctx.rover.cap * v / 100, 0)} Wh + the trip`)]],
      say: (a, b) => b < 10 ? L('Peligro: casi sin reserva, un rodeo o una perforación larga pueden dejarlo sin energía dentro del cráter, donde no hay sol para recargar.', 'Danger: with almost no reserve, a detour or a long drill can leave it without power inside the crater, where there is no sunlight to recharge.')
        : b > a ? L('Más prudente: vuelve antes y con más margen, pero hace menos trabajo en cada salida.', 'More cautious: it returns earlier and with more margin, but does less work on each outing.') : L('Más arriesgado: aprovecha más cada salida, con menos margen de error.', 'Riskier: it gets more out of each outing, with less margin for error.')
    },
    heaterW: {
      title: L('Potencia del horno', 'Oven power'),
      help: L('Calor para convertir el hielo de las muestras en vapor. Limitada por los paneles solares.', 'Heat to turn the ice in the samples into vapour. Limited by the solar panels.'),
      rows: (P, v) => { const r = batch({ ...P, heaterW: v }); return [[L('Potencia que llega al horno', 'Power reaching the oven'), `${fmt(Math.min(v, P.solarW), 0)} W`], [L('Tiempo para un lote de ~45 kg', 'Time for a ~45 kg batch'), h(r.time.hours)]]; },
      say: (a, b, P) => b > P.solarW ? L('La estación no tiene tanta energía solar: el horno no puede pasar de lo que dan los paneles.', 'The station does not have that much solar power: the oven cannot exceed what the panels provide.')
        : b > a ? L('Los lotes se procesan antes. La energía total por litro de agua es la misma: solo va más rápido.', 'Batches are processed sooner. The total energy per litre of water is the same: it just goes faster.') : L('Más lento: las muestras esperan más en cola.', 'Slower: samples wait longer in the queue.')
    },
    etaH: {
      title: L('Eficiencia de calentamiento', 'Heating efficiency'),
      help: L('Qué parte del calor llega de verdad a la muestra (el resto se pierde por radiación).', 'How much of the heat actually reaches the sample (the rest is lost as radiation).'),
      rows: (P, v) => { const r = batch({ ...P, etaH: v }); return [[L('Energía por litro de agua', 'Energy per litre of water'), `${fmt(r.specific, 1)} kWh/L`], [L('Tiempo por lote', 'Time per batch'), h(r.time.hours)]]; },
      say: (a, b) => b > a ? L('Menos calor desperdiciado: cada litro de agua cuesta menos energía y los lotes van más rápido.', 'Less wasted heat: each litre of water costs less energy and batches go faster.') : L('Se pierde más calor: el agua sale más cara en energía.', 'More heat is lost: the water costs more energy.')
    },
    etaCap: {
      title: L('Captura de vapor', 'Vapour capture'),
      help: L('Qué parte del vapor se congela en la trampa fría en vez de escaparse.', 'How much of the vapour freezes in the cold trap instead of escaping.'),
      rows: (P, v) => [[L('Agua obtenida por kg de hielo', 'Water obtained per kg of ice'), `${fmt(v * 0.92, 2)} L`], [L('Energía por litro de agua', 'Energy per litre of water'), `${fmt(batch({ ...P, etaCap: v }).specific, 1)} kWh/L`]],
      say: (a, b) => b > a ? L('Se escapa menos vapor: más agua con la misma energía.', 'Less vapour escapes: more water for the same energy.') : L('Se escapa más vapor: se pierde agua que ya costó energía sublimar.', 'More vapour escapes: water that already cost energy to sublime is lost.')
    },
    solarW: {
      title: L('Paneles solares de la estación', 'Station solar panels'),
      help: L('Energía disponible en la cresta iluminada para el horno, la carga del rover y la cámara biológica.', 'Power available on the sunlit ridge for the oven, rover charging and the biological chamber.'),
      rows: (P, v) => [[L('Disponible para el horno (con el rover cargando)', 'Available for the oven (with the rover charging)'), `${fmt(Math.max(0, v - 450 - 30), 0)} W`]],
      say: (a, b) => b > a ? L('Más energía: el horno puede trabajar a más potencia mientras el rover se recarga.', 'More power: the oven can run at higher power while the rover recharges.') : L('Menos energía: horno y rover compiten. Mira el reparto en la pestaña Planta.', 'Less power: the oven and the rover compete. See the split in the Plant tab.')
    },
    Tc: {
      title: L('Temperatura de la cámara', 'Chamber temperature'),
      help: L('Cada organismo tiene un rango de temperatura en el que crece.', 'Each organism has a temperature range in which it grows.'),
      rows: (P, v, ctx) => ctx.species.map(s => [s.name, speciesLine(s, v, P, P.dose)]),
      say: (a, b) => b < 0 ? L('Bajo cero el agua se congela: las bacterias dejan de crecer y el biofiltro deja de limpiar.', 'Below zero the water freezes: the bacteria stop growing and the biofilter stops cleaning.')
        : b > 38 ? L('Demasiado calor para estas especies: empiezan a morir y el biofiltro pierde eficacia.', 'Too hot for these species: they start to die and the biofilter loses effectiveness.')
        : b < 10 ? L('Por debajo de 10 °C Deinococcus se detiene: el mercurio ya no se elimina en el biofiltro.', 'Below 10 °C Deinococcus stops: mercury is no longer removed in the biofilter.')
        : L('Cada especie responde distinto. Si una deja de crecer, su parte de la limpieza baja.', 'Each species responds differently. If one stops growing, its share of the cleaning drops.')
    },
    feed: {
      title: L('Agua del tanque a la cámara', 'Water from the tank to the chamber'),
      help: L('Agua limpia para mantener húmedo el biofiltro entre lotes. Se resta del tanque.', 'Clean water to keep the biofilter moist between batches. It is taken from the tank.'),
      rows: (P, v) => [[L('Agua que sale del tanque al día', 'Water taken from the tank per day'), `${fmt(v * 24 / 1000, 3)} L`]],
      say: (a, b) => b === 0 ? L('Sin aporte, la cámara se irá secando. P. extremorientalis muere con la sequedad; Deinococcus la resiste mucho mejor.', 'With no supply, the chamber will dry out. P. extremorientalis dies from dryness; Deinococcus withstands it much better.')
        : L('Mantiene vivo el biofiltro entre lotes. Es poca agua comparada con la que ayuda a limpiar.', 'It keeps the biofilter alive between batches. It is little water compared with what it helps to clean.')
    },
    dose: {
      title: L('Radiación', 'Radiation'),
      help: L('En la superficie lunar hay ≈ 13 µGy/h. Los valores altos simulan una fuente de laboratorio.', 'The lunar surface receives ≈ 13 µGy/h. High values simulate a laboratory source.'),
      rows: (P, v, ctx) => ctx.species.map(s => [s.name, L(`pierde el 90 % cada ${h(s.D10 / v)}`, `loses 90% every ${h(s.D10 / v)}`)]),
      say: () => L('Deinococcus repara su ADN muy bien (resistió más de 10 kGy en su descripción original). Pseudomonas es mucho más sensible: si muere, el amoníaco y los orgánicos dejan de eliminarse.', 'Deinococcus repairs its DNA very well (it withstood more than 10 kGy in its original description). Pseudomonas is much more sensitive: if it dies, ammonia and organics are no longer removed.')
    },
    nutrients: {
      title: L('Nutrientes', 'Nutrients'),
      help: L('Alimento inicial de las bacterias. El amoníaco y el metanol del agua sucia también las alimentan.', 'Initial food for the bacteria. The ammonia and methanol in the dirty water also feed them.'),
      rows: (P, v) => [[L('Velocidad de crecimiento posible', 'Possible growth rate'), L(`${fmt(v / (0.1 + v) * 100, 0)} % del máximo`, `${fmt(v / (0.1 + v) * 100, 0)}% of maximum`)]],
      say: (a, b) => b < 0.1 ? L('Sin nutrientes las bacterias no pueden multiplicarse, aunque la temperatura sea buena.', 'Without nutrients the bacteria cannot multiply, even if the temperature is right.') : L('Con más alimento crecen más rápido, hasta que la población satura la cámara.', 'With more food they grow faster, until the population fills the chamber.')
    },
    bioPurif: {
      title: L('Biofiltro', 'Biofilter'),
      help: L('Las bacterias limpian el agua antes de los filtros químicos, que vienen de la Tierra y se gastan.', 'The bacteria clean the water before the chemical filters, which come from Earth and get used up.'),
      rows: (P, v) => [[L('Contaminantes que llegan a los filtros (bacterias activas)', 'Contaminants reaching the filters (active bacteria)'), v ? L('≈ 20–60 de 100', '≈ 20–60 of 100') : L('100 de 100', '100 of 100')], [L('Adsorbente gastado por litro de agua', 'Adsorbent used per litre of water'), v ? L('≈ 0,05–0,15 kg', '≈ 0.05–0.15 kg') : L('0,25 kg', '0.25 kg')]],
      say: (a, b) => b ? L('Las bacterias se comen el amoníaco y los compuestos orgánicos, y Deinococcus inmoviliza el mercurio. Los filtros químicos duran varias veces más.', 'The bacteria eat the ammonia and organic compounds, and Deinococcus immobilises the mercury. The chemical filters last several times longer.')
        : L('Sin biofiltro, todo lo limpian los filtros químicos. Se gastan rápido y, cuando se acaban, el agua sale contaminada. Mira el adsorbente restante.', 'Without the biofilter, the chemical filters do all the cleaning. They wear out quickly and, when they run out, the water comes out contaminated. Watch the remaining adsorbent.')
    },
    chamber: {
      title: L('Ubicación de la cámara', 'Chamber location'),
      help: L('Protegida: temperatura y agua controladas. Exterior: vacío, frío y radiación lunar.', 'Protected: controlled temperature and water. Outside: vacuum, cold and lunar radiation.'),
      rows: (P, v) => [[L('Temperatura', 'Temperature'), v === 'outside' ? '≈ −40 °C' : `${fmt(P.Tc, 0)} °C`], [L('Agua líquida', 'Liquid water'), v === 'outside' ? L('No: el vacío la evapora', 'No: the vacuum evaporates it') : L('Sí', 'Yes')]],
      say: (a, b) => b === 'outside' ? L('En el exterior no hay agua líquida ni aire: las bacterias dejan de crecer, el biofiltro deja de limpiar y los filtros químicos se gastan más rápido. Por eso el biofiltro va dentro de la estación, sellado.', 'Outside there is no liquid water or air: the bacteria stop growing, the biofilter stops cleaning and the chemical filters wear out faster. That is why the biofilter sits inside the station, sealed.')
        : L('De vuelta a la cámara protegida: si sobrevivieron, vuelven a crecer y a limpiar el agua.', 'Back in the protected chamber: if they survived, they grow again and clean the water.')
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
