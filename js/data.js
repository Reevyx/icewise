/* =========================================================================
   ICEWISE — Datos compartidos: referencias, componentes, depósitos simulados
   Todas las DOI de esta lista se comprobaron contra doi.org / Crossref.
   ========================================================================= */
(function (root) {
  'use strict';

  // kind: 'peer' (revisado por pares) | 'agency' (NASA/ESA/ISRO) | 'book' | 'db' (base de datos) | 'news' | 'image'
  const REFS = [
    { id: 1, kind: 'peer', text: 'Feldman, W. C. et al. (1998). Fluxes of fast and epithermal neutrons from Lunar Prospector: evidence for water ice at the lunar poles. Science 281, 1496–1500.', url: 'https://doi.org/10.1126/science.281.5382.1496' },
    { id: 2, kind: 'peer', text: 'Feldman, W. C. et al. (2001). Evidence for water ice near the lunar poles. Journal of Geophysical Research: Planets 106(E10), 23231–23251.', url: 'https://doi.org/10.1029/2000JE001444' },
    { id: 3, kind: 'peer', text: 'Colaprete, A. et al. (2010). Detection of water in the LCROSS ejecta plume. Science 330, 463–468.', url: 'https://doi.org/10.1126/science.1186986' },
    { id: 4, kind: 'peer', text: 'Paige, D. A. et al. (2010). Diviner Lunar Radiometer observations of cold traps in the Moon’s south polar region. Science 330, 479–482.', url: 'https://doi.org/10.1126/science.1187726' },
    { id: 5, kind: 'peer', text: 'Gladstone, G. R. et al. (2010). LRO-LAMP observations of the LCROSS impact plume. Science 330, 472–476.', url: 'https://doi.org/10.1126/science.1186474' },
    { id: 6, kind: 'peer', text: 'Li, S. et al. (2018). Direct evidence of surface exposed water ice in the lunar polar regions. PNAS 115(36), 8907–8912.', url: 'https://doi.org/10.1073/pnas.1802345115' },
    { id: 7, kind: 'peer', text: 'Pieters, C. M. et al. (2009). Character and spatial distribution of OH/H₂O on the surface of the Moon seen by M3 on Chandrayaan-1. Science 326, 568–572.', url: 'https://doi.org/10.1126/science.1178658' },
    { id: 8, kind: 'peer', text: 'Mitrofanov, I. G. et al. (2010). Hydrogen mapping of the lunar south pole using the LRO Neutron Detector Experiment LEND. Science 330, 483–486.', url: 'https://doi.org/10.1126/science.1185696' },
    { id: 9, kind: 'peer', text: 'Spudis, P. D. et al. (2010). Initial results for the north pole of the Moon from Mini-SAR, Chandrayaan-1 mission. Geophysical Research Letters 37, L06204.', url: 'https://doi.org/10.1029/2009GL042259' },
    { id: 10, kind: 'peer', text: 'Campbell, D. B. et al. (2006). No evidence for thick deposits of ice at the lunar south pole. Nature 443, 835–837.', url: 'https://doi.org/10.1038/nature05167' },
    { id: 11, kind: 'peer', text: 'Hayne, P. O. et al. (2021). Micro cold traps on the Moon. Nature Astronomy 5, 169–175.', url: 'https://doi.org/10.1038/s41550-020-1198-9' },
    { id: 12, kind: 'peer', text: 'Hayne, P. O. et al. (2017). Global regolith thermophysical properties of the Moon from the Diviner Lunar Radiometer Experiment. JGR Planets 122, 2371–2400.', url: 'https://doi.org/10.1002/2017JE005387' },
    { id: 13, kind: 'book', text: 'Heiken, G., Vaniman, D. & French, B. M. (eds.) (1991). Lunar Sourcebook: A User’s Guide to the Moon. Cambridge University Press. (Cap. 9: Carrier, Olhoeft & Mendell, propiedades físicas del regolito).', url: 'https://www.lpi.usra.edu/publications/books/lunar_sourcebook/' },
    { id: 14, kind: 'peer', text: 'Murphy, D. M. & Koop, T. (2005). Review of the vapour pressures of ice and supercooled water for atmospheric applications. Q. J. R. Meteorol. Soc. 131, 1539–1565.', url: 'https://doi.org/10.1256/qj.04.94' },
    { id: 15, kind: 'peer', text: 'Giauque, W. F. & Stout, J. W. (1936). The entropy of water and the third law of thermodynamics. The heat capacity of ice from 15 to 273 K. J. Am. Chem. Soc. 58, 1144–1150.', url: 'https://doi.org/10.1021/ja01298a023' },
    { id: 16, kind: 'peer', text: 'Mazarico, E. et al. (2011). Illumination conditions of the lunar polar regions using LOLA topography. Icarus 211, 1066–1081.', url: 'https://doi.org/10.1016/j.icarus.2010.10.030' },
    { id: 17, kind: 'peer', text: 'Hayne, P. O. et al. (2015). Evidence for exposed water ice in the Moon’s south polar regions from LRO ultraviolet albedo and temperature measurements. Icarus 255, 58–69.', url: 'https://doi.org/10.1016/j.icarus.2015.03.032' },
    { id: 18, kind: 'peer', text: 'Honniball, C. I. et al. (2021). Molecular water detected on the sunlit Moon by SOFIA. Nature Astronomy 5, 121–127.', url: 'https://doi.org/10.1038/s41550-020-01222-x' },
    { id: 19, kind: 'peer', text: 'Cannon, K. M. & Britt, D. T. (2020). A geologic model for lunar ice deposits at mining scales. Icarus 347, 113778.', url: 'https://doi.org/10.1016/j.icarus.2020.113778' },
    { id: 20, kind: 'peer', text: 'Kornuta, D. et al. (2019). Commercial lunar propellant architecture: A collaborative study of lunar propellant production. REACH 13, 100026.', url: 'https://doi.org/10.1016/j.reach.2019.100026' },
    { id: 21, kind: 'news', text: 'SpacePolicyOnline (2025). IM-2 mission ends less than a day after lunar landing (resultado de PRIME-1/TRIDENT).', url: 'https://spacepolicyonline.com/news/im-2-mission-ends-one-day-after-lunar-landing/' },
    { id: 22, kind: 'agency', text: 'ESA. Prospect: searching for water at the lunar poles (taladro ProSEED y laboratorio ProSPA).', url: 'https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/Prospect_searching_for_water_at_the_lunar_poles' },
    { id: 23, kind: 'agency', text: 'NASA (2025). NASA selects Blue Origin to deliver VIPER rover to Moon’s south pole.', url: 'https://www.nasa.gov/news-release/nasa-selects-blue-origin-to-deliver-viper-rover-to-moons-south-pole/' },
    { id: 24, kind: 'agency', text: 'NASA Science. VIPER — Volatiles Investigating Polar Exploration Rover.', url: 'https://science.nasa.gov/mission/viper/' },
    { id: 25, kind: 'news', text: 'Space.com (2026). Bad weather delays launch of China’s Chang’e 7 mission to the Moon’s south pole.', url: 'https://www.space.com/space-exploration/launches-spacecraft/bad-weather-delays-launch-of-chinas-historic-change-7-mission-to-moons-south-pole' },
    { id: 26, kind: 'agency', text: 'COSPAR Panel on Planetary Protection (2021). Comunicado sobre la actualización de la política lunar (Categorías IIa/IIb).', url: 'https://www.isprs.org/news/newsletter/2021-03/53-PR_PPP_15July2021.pdf' },
    { id: 27, kind: 'peer', text: 'Rainey, F. A. et al. (2007). Deinococcus peraridilitoris sp. nov., isolated from a coastal desert. Int. J. Syst. Evol. Microbiol. 57, 1408–1412.', url: 'https://doi.org/10.1099/ijs.0.64956-0' },
    { id: 28, kind: 'peer', text: 'Cox, M. M. & Battista, J. R. (2005). Deinococcus radiodurans — the consummate survivor. Nature Reviews Microbiology 3, 882–892.', url: 'https://doi.org/10.1038/nrmicro1264' },
    { id: 29, kind: 'db', text: 'LPSN (DSMZ). Pseudomonas extremorientalis Ivanova et al. 2002 — descrita a partir de un embalse de agua potable cerca de Vladivostok (Int. J. Syst. Evol. Microbiol. 52, 2113–2120).', url: 'https://lpsn.dsmz.de/species/pseudomonas-extremorientalis' },
    { id: 30, kind: 'db', text: 'BacDive (DSMZ). Pseudomonas extremorientalis, cepa tipo — fisiología: aerobia, mesófila, Gram-negativa.', url: 'https://bacdive.dsmz.de/strain/13091' },
    { id: 31, kind: 'peer', text: 'Schroeter, B. (1994). In situ photosynthetic differentiation of the green algal and the cyanobacterial photobiont in the crustose lichen Placopsis contortuplicata. Oecologia 98, 212–220.', url: 'https://doi.org/10.1007/BF00341474' },
    { id: 32, kind: 'peer', text: 'Sancho, L. G. et al. (2007). Lichens survive in space: results from the 2005 LICHENS experiment. Astrobiology 7, 443–454.', url: 'https://doi.org/10.1089/ast.2006.0046' },
    { id: 33, kind: 'peer', text: 'Kawaguchi, Y. et al. (2020). DNA damage and survival time course of deinococcal cell pellets during 3 years of exposure to outer space. Frontiers in Microbiology 11, 2050.', url: 'https://doi.org/10.3389/fmicb.2020.02050' },
    { id: 34, kind: 'peer', text: 'Bussey, D. B. J. et al. (2010). Illumination conditions of the south pole of the Moon derived using Kaguya topography. Icarus 208, 558–564.', url: 'https://doi.org/10.1016/j.icarus.2010.03.028' },
    { id: 35, kind: 'peer', text: 'Sowers, G. F. & Dreyer, C. B. (2019). Ice mining in lunar permanently shadowed regions. New Space 7, 235–244.', url: 'https://doi.org/10.1089/space.2019.0002' },
    { id: 36, kind: 'peer', text: 'Li, C. et al. (2020). The Moon’s farside shallow subsurface structure unveiled by Chang’E-4 Lunar Penetrating Radar. Science Advances 6, eaay6898.', url: 'https://doi.org/10.1126/sciadv.aay6898' },
    { id: 37, kind: 'agency', text: 'NASA Science. Lunar Reconnaissance Orbiter (LRO).', url: 'https://science.nasa.gov/mission/lro/' },
    { id: 38, kind: 'agency', text: 'NASA Science. LCROSS — Lunar Crater Observation and Sensing Satellite.', url: 'https://science.nasa.gov/mission/lcross/' },
    { id: 39, kind: 'agency', text: 'ISRO. Chandrayaan-3.', url: 'https://www.isro.gov.in/Chandrayaan3_Details.html' },
    { id: 40, kind: 'agency', text: 'NASA Science. Lunar Trailblazer.', url: 'https://science.nasa.gov/mission/lunar-trailblazer/' },
    { id: 41, kind: 'agency', text: 'NASA Science. Lunar Prospector.', url: 'https://science.nasa.gov/mission/lunar-prospector/' },
    { id: 42, kind: 'image', text: 'NASA (2026). art002e009281 — Shadows at the Edge of Lunar Day. Fotografía de la tripulación de Artemis II (imagen de portada).', url: 'https://images.nasa.gov/details/art002e009281' },
    { id: 43, kind: 'image', text: 'NASA/GSFC/Arizona State University (2010). PIA13523 — The Lunar South Pole, mosaico LROC WAC, proyección estereográfica polar, 400 m/píxel.', url: 'https://images.nasa.gov/details/PIA13523' },
    { id: 44, kind: 'image', text: 'NASA Glenn Research Center (2019). GRC-2019-C-09947 — Prueba de movilidad de VIPER en el laboratorio SLOPE.', url: 'https://images.nasa.gov/details/GRC-2019-C-09947' },
    { id: 46, kind: 'peer', text: 'Brim, H. et al. (2000). Engineering Deinococcus radiodurans for metal remediation in radioactive mixed waste environments. Nature Biotechnology 18, 85–90.', url: 'https://doi.org/10.1038/71986' },
    { id: 47, kind: 'peer', text: 'Hawksworth, D. L. & Rose, F. (1970). Qualitative scale for estimating sulphur dioxide air pollution in England and Wales using epiphytic lichens. Nature 227, 145–148.', url: 'https://doi.org/10.1038/227145a0' },
    { id: 48, kind: 'peer', text: 'Barker, M. K. et al. (2021). Improved LOLA elevation maps for south pole landing sites: error estimates and their impact on illumination conditions. Planetary and Space Science 203, 105119. (Datos: NASA GSFC PGDA, LOLA 5 m/pix, Site04 «Shackleton rim»).', url: 'https://pgda.gsfc.nasa.gov/products/78' },
    { id: 49, kind: 'agency', text: 'CORDIS (Comisión Europea). LUWEX — A water extraction system for the Moon (proyecto 101081937).', url: 'https://cordis.europa.eu/project/id/101081937' },
    { id: 50, kind: 'agency', text: 'Barta, D. J., Pickering, K. D., Meyer, C. et al. (2015). A biologically-based Alternative Water Processor for long duration space missions. NASA NTRS 20150014482.', url: 'https://ntrs.nasa.gov/citations/20150014482' },
    { id: 51, kind: 'news', text: 'Space.com. There\'s lots of water on the Moon for astronauts. But is it safe to drink? (Aqualunar Challenge).', url: 'https://www.space.com/moon-water-astronauts-aqualunar-drinking-safety-contest' },
    { id: 45, kind: 'image', text: 'NASA (2026). art002e014055 — Craters Along the Lunar Terminator. Fotografía de la tripulación de Artemis II.', url: 'https://images.nasa.gov/details/art002e014055' }
  ];

  const KIND_LABEL = { peer: 'Revisado por pares', agency: 'Agencia espacial', book: 'Libro de referencia', db: 'Base de datos científica', news: 'Prensa especializada', image: 'Imagen' };

  // ---------- Componentes del rover (sección 5) ----------
  // status: 'exist' (tecnología existente con herencia de vuelo) | 'dev' (en desarrollo) | 'ice' (propuesta ICEWISE)
  const ROVER_PARTS = [
    { n: 1, name: 'Mástil de navegación', status: 'exist', sub: 'Cámaras estéreo + iluminación activa + LiDAR',
      body: 'Visión estéreo para mapas de elevación locales. Dentro de un PSR no hay luz solar: se requieren focos LED y/o LiDAR. VIPER fue diseñado con faros para operar en sombra.', refs: [24] },
    { n: 2, name: 'Antena de alta ganancia', status: 'exist', sub: 'Enlace directo a Tierra o vía relé',
      body: 'Cerca del polo sur la Tierra está muy baja en el horizonte y puede quedar oculta por el relieve. ICEWISE asume un relé en el borde iluminado y ventanas de comunicación planificadas.', refs: [16] },
    { n: 3, name: 'Paneles solares verticales', status: 'exist', sub: 'Orientados al Sol rasante',
      body: 'En el polo el Sol está siempre cerca del horizonte, por lo que los paneles se montan verticalmente. Solo cargan fuera de la sombra: el rover entra al PSR con energía de batería limitada.', refs: [16, 34] },
    { n: 4, name: 'Batería y gestión energética', status: 'exist', sub: 'Li-ion con calentadores de supervivencia',
      body: 'La batería debe mantenerse por encima de su temperatura mínima de operación; parte de la energía se gasta solo en calefacción. El planificador de ICEWISE reserva un margen para salir del PSR.', refs: [] },
    { n: 5, name: 'Espectrómetro de neutrones', status: 'exist', sub: 'Mide hidrógeno hasta ~1 m de profundidad',
      body: 'El hidrógeno modera los neutrones y reduce el flujo epitermal. Detecta hidrógeno, no hielo de forma directa, y promedia un volumen amplio. Herencia: Lunar Prospector, LEND, VIPER NSS.', refs: [1, 8, 24] },
    { n: 6, name: 'Radar de penetración (GPR)', status: 'dev', sub: 'Estratigrafía y contrastes dieléctricos',
      body: 'Los rovers Yutu (Chang’e-3/4) usaron radar de penetración lunar para la estratigrafía. El hielo disperso en poros produce contrastes débiles: el GPR no identifica hielo de forma única y su uso para ello requiere adaptación.', refs: [36] },
    { n: 7, name: 'Espectrómetro NIR', status: 'exist', sub: 'Absorciones de H₂O/OH en superficie',
      body: 'Solo ve los primeros micrómetros a milímetros. Útil para escombros de perforación expuestos y escarcha superficial (M3, VIPER NIRVSS). Requiere iluminación activa en sombra.', refs: [6, 7] },
    { n: 8, name: 'Taladro rotopercutor de 1 m', status: 'exist', sub: 'Muestreo por “mordidas” de ~10 cm',
      body: 'Basado en la clase TRIDENT/ProSEED. Avanzar en incrementos cortos limita el calentamiento por fricción y la pérdida de volátiles. Requiere herramienta de corte para material cementado.', refs: [21, 22] },
    { n: 9, name: 'Contenedores sellados de muestra', status: 'ice', sub: 'Cadena de frío y trazabilidad',
      body: 'Propuesta ICEWISE: los recortes se transfieren a cartuchos sellados que mantienen la muestra fría hasta el módulo de procesamiento, para no perder hielo por sublimación durante el transporte.', refs: [] },
    { n: 10, name: 'Ruedas y suspensión activa', status: 'exist', sub: 'Cuatro ruedas, suspensión activa',
      body: 'El regolito suelto y las pendientes de los cráteres exigen tracción alta. VIPER fue probado en pendientes de regolito simulado (imagen de esta sección). ICEWISE limita la pendiente de trabajo a ≤ 15°.', refs: [24, 44] },
    { n: 11, name: 'Control térmico', status: 'exist', sub: 'Radiadores, aislamiento multicapa, calentadores',
      body: 'Dentro de un PSR el entorno puede estar por debajo de 40 K. La electrónica debe mantenerse entre ~250 y 320 K. El calor residual se gestiona para no contaminar térmicamente la muestra.', refs: [4] },
    { n: 12, name: 'Computadora de autonomía', status: 'ice', sub: 'Fusión de sensores y decisión GO / NO-GO',
      body: 'Propuesta ICEWISE: combina neutrones, GPR, temperatura y modelo térmico en un mapa de probabilidad con incertidumbre, y aplica reglas de decisión explícitas antes de perforar.', refs: [] }
  ];

  // ---------- Depósitos candidatos (SIMULADOS) para dashboard y simulación ----------
  // Posiciones en el mapa local (0–1000 × 0–700 unidades; 1 unidad = 2 m). Valores ilustrativos coherentes con rangos publicados.
  const DEPOSITS = [
    { id: 'D-01', name: 'Borde norte PSR-A', x: 300, y: 285, pIce: 0.42, wt: 1.2, wtSigma: 0.9, depthToIce: 0.35, slope: 9, T: 64, area: 900, conf: 'Baja' },
    { id: 'D-02', name: 'Suelo PSR-A', x: 385, y: 435, pIce: 0.78, wt: 5.6, wtSigma: 2.4, depthToIce: 0.12, slope: 6, T: 41, area: 2400, conf: 'Media' },
    { id: 'D-03', name: 'Micro trampa fría', x: 545, y: 535, pIce: 0.66, wt: 8.5, wtSigma: 4.0, depthToIce: 0.06, slope: 19, T: 47, area: 120, conf: 'Media' },
    { id: 'D-04', name: 'Pared PSR-B', x: 640, y: 205, pIce: 0.51, wt: 3.0, wtSigma: 2.0, depthToIce: 0.30, slope: 24, T: 52, area: 1100, conf: 'Baja' },
    { id: 'D-05', name: 'Suelo PSR-B', x: 718, y: 290, pIce: 0.84, wt: 10.0, wtSigma: 3.1, depthToIce: 0.05, slope: 5, T: 38, area: 1800, conf: 'Alta' }
  ];

  // Geometría simulada de la región (unidades del mapa)
  const REGION = {
    psr: [ { id: 'PSR-A', x: 370, y: 410, r: 150 }, { id: 'PSR-B', x: 705, y: 265, r: 118 } ],
    station: { x: 120, y: 150, name: 'Estación de energía, relé y procesamiento (borde iluminado)' },
    ridge: [[40, 60], [260, 110], [520, 70], [880, 40]]
  };

  root.IceData = { REFS, KIND_LABEL, ROVER_PARTS, DEPOSITS, REGION };
})(typeof window !== 'undefined' ? window : globalThis);
