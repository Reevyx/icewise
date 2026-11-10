# ICEWISE — Discurso de presentación

**Duración aproximada:** 6–7 minutos con la demostración.
**Material:** la página abierta en el navegador, empezando en la portada.
Las indicaciones entre corchetes **[ ]** son acciones; no se leen en voz alta.

---

## 1. Apertura (30 s)

[Portada en pantalla.]

Buenos días. Esta foto la tomó la tripulación de Artemis II en abril de este año. Muestra el borde entre el día y la noche en la Luna.

Cerca del polo sur hay cráteres donde el Sol no ha entrado en miles de millones de años. Hacen unos 233 grados bajo cero. Y ahí dentro hay hielo de agua.

Nuestro proyecto se llama **ICEWISE**: un sistema robótico que busca ese hielo, decide dónde vale la pena sacarlo y lo convierte en agua.

---

## 2. El problema (45 s)

[Bajar a «El reto».]

Sabemos que hay hielo. En 2009, la misión LCROSS de la NASA estrelló un cohete contra el cráter Cabeus y midió un 5,6 % de agua en el material que levantó.

Pero lo que no sabemos es lo importante: **dónde está exactamente, cuánto hay y cómo sacarlo.**

Hay tres obstáculos:

- **Oscuridad:** dentro del cráter no hay energía solar ni luz para las cámaras.
- **Incertidumbre:** el hielo está repartido en manchas, debajo de una capa de polvo seco.
- **Energía:** si hay poco hielo, casi toda la energía se gasta en calentar roca.

Hasta hoy, ninguna misión ha extraído agua en la Luna.

---

## 2b. Dónde: el borde de Shackleton (30 s)

[Bajar a «Shackleton».]

Nuestra colonia estaría en el borde del cráter Shackleton, a 89,6 grados de latitud sur, casi en el polo.

Este mapa no es un dibujo: es el relieve real medido por el láser de la sonda LRO de la NASA, con 5 metros por píxel. Con ese relieve calculamos qué zonas nunca reciben el Sol, que son las azules.

En el punto elegido para la estación da el Sol el 83 % del tiempo, y la sombra permanente más cercana está a unos 300 metros. Energía arriba, hielo abajo.

---

## 3. Nuestra solución (45 s)

[Bajar a «Cómo funciona».]

ICEWISE funciona en seis pasos.

1. El rover **explora** con sus propias luces.
2. **Detecta** el hidrógeno del hielo con un sensor de neutrones.
3. Se detiene y **mide** con más precisión.
4. **Decide** si vale la pena: ¿hay suficiente hielo, el terreno es seguro y le queda batería para volver?
5. Si la respuesta es sí, **perfora** un metro y guarda la muestra.
6. Vuelve a una estación solar en la cresta iluminada, donde un horno **convierte** el hielo en agua y un **biofiltro con microorganismos** ayuda a limpiarla.

La idea clave es separar la energía del recurso: la energía está arriba, con el Sol, y el hielo abajo, en la oscuridad. El rover viaja entre los dos.

No inventamos los sensores ni el taladro, que ya existen o están en desarrollo en la NASA y la ESA. Lo que proponemos es unir todo en un solo ciclo que decide por sí mismo.

---

## 4. Demostración en vivo (2 min)

[Bajar a «Simulación». Pulsar **Iniciar misión** en la guía.]

Esto no es un video: es una simulación que calcula en tiempo real, sobre la topografía real del borde de Shackleton.

[Señalar la estación.]

Aquí está la estación, en la cresta con sol.

[Señalar los cristales azules.]

Estos cristales azules marcan dónde hay hielo de verdad bajo el suelo. **El rover no los ve.** Igual que en la Luna, tiene que descubrirlos midiendo.

[Señalar los cuadros blancos que aparecen.]

Estos cuadros son lo que el rover va midiendo con su sensor. Cuando un cuadro se rellena, significa que encontró suficiente hielo.

[Señalar el corte del subsuelo.]

Aquí vemos el subsuelo bajo el rover: arriba, la capa de polvo seco, y debajo, el suelo con hielo. Fíjense en que el rover estima menos hielo del que hay en realidad. Es porque la capa seca atenúa la señal del sensor, y por eso necesita perforar para confirmar.

[Pasar el ratón por el cráter.]

Puedo pasar el ratón por cualquier punto y ver cuánto hielo hay, a qué profundidad y a qué temperatura.

[Pestaña Misión → pulsar **¿Y si el rover es muy exigente?**]

Ahora cambio una decisión: le pido al rover que solo perfore si hay más del 6 % de hielo.

[Señalar el recuadro «Qué cambia».]

La página me explica el efecto con números: será más exigente, perforará menos veces, pero cada muestra traerá más del doble de hielo. Y en el diario vemos cómo empieza a rechazar zonas.

[Opcional, si hay tiempo: **¿Y si no guarda batería para volver?**]

Si le quito la reserva de batería, puede quedarse sin energía dentro del cráter, donde no hay sol para recargar. Por eso la reserva es una regla obligatoria del sistema.

[Señalar la barra de etapas bajo el visor.]

Esta barra muestra en qué etapa está el agua en cada momento: perforar, transportar, horno, trampa fría, biofiltro, filtros, tanque y colonia. Al pulsar cualquiera, la cámara va a esa parte.

---

## 5. Cómo obtenemos agua (40 s)

[Pestaña **Planta**; la cámara va a la estación.]

En el vacío, el hielo no se derrite: al calentarlo por encima de unos 210 kelvin pasa directamente a vapor.

El horno calienta las muestras. El vapor viaja hasta una **trampa fría**, esta caja que se cubre de escarcha, y se congela. Después esa escarcha se funde.

Pero esa agua todavía está sucia: trae amoníaco, compuestos de azufre, metanol y mercurio, las mismas sustancias que LCROSS detectó junto al agua. Y aquí entran nuestros microorganismos.

Distinguimos tres niveles: **agua recuperada**, que no es potable; **agua purificada**, para uso técnico; y **agua apta para beber**, que exige análisis y certificación. Nuestra simulación llega hasta el agua purificada.

[Botón de cámara **Colonia**.]

Desde el tanque, una tubería sobre soportes lleva el agua a la colonia, a unos 250 metros. Aquí vemos las gotas llegando y el depósito llenándose. El panel indica cuántos días de reserva tiene: suponemos cuatro personas que reciclan el 90 % de su agua, así que necesitan alrededor de 1 kg de agua nueva al día.

---

## 6. Los microorganismos limpian el agua (50 s)

[Pestaña **Biofiltro**; la cámara muestra la cúpula.]

Esta cúpula es un **biofiltro sellado**. El agua sucia pasa por él antes de llegar a los filtros químicos, y cada organismo tiene una tarea:

- ***Pseudomonas extremorientalis*** se alimenta del amoníaco y de los compuestos orgánicos y de azufre. Para ella, esa contaminación es comida.
- ***Deinococcus peraridilitoris***, del desierto de Atacama, se encarga del mercurio. Su género ya se ha modificado en laboratorio para reducir mercurio en ambientes radiactivos, y resiste la radiación como casi ningún otro ser vivo.
- El liquen ***Placopsis*** es nuestro **biomonitor**: los líquenes son muy sensibles al azufre y los metales, así que si el agua sale sucia, el liquen lo nota.

[Señalar «Contaminantes: 100 → 25 → 1».]

El agua entra con un índice de contaminación de 100. El biofiltro lo baja a unos 25, y los filtros químicos terminan el trabajo. ¿Por qué no usar solo filtros? Porque vienen de la Tierra y se gastan.

[Misión → **¿Y si apagamos el biofiltro?**]

Sin biofiltro, el adsorbente se agota varias veces más rápido, y cuando se acaba, el agua sale contaminada. Con el biofiltro, los mismos filtros duran mucho más.

[Opcional: **¿Y si los irradiamos fuerte?**]

Si una tormenta de radiación mata a *Pseudomonas*, el amoníaco deja de eliminarse, mientras que *Deinococcus* sobrevive y sigue con el mercurio. Por eso usamos varias especies.

Queremos ser precisos: los microorganismos **no convierten el hielo en agua**, eso lo hace el calor. Lo que hacen es **limpiarla**. Que estas especies concretas funcionen en un biofiltro lunar es una hipótesis que probaremos en el laboratorio, siempre en sistemas cerrados y sin liberar nada en la Luna.

---

## 7. ¿Es viable? (40 s)

[Bajar a «Viabilidad».]

Con la concentración que midió LCROSS, procesar unos 430 kg de suelo da unos 16 kg de agua, a algo más de 4 kWh por kilo.

[Mover el control de concentración hacia la izquierda.]

Pero miren qué pasa si hay poco hielo: la energía por kilo se dispara, porque casi todo el calor se va en calentar roca. **La concentración real es la variable más importante, y también la más incierta.** Por eso ICEWISE primero mide y decide, y solo después perfora.

---

## 8. Limitaciones (30 s)

Somos conscientes de lo que todavía no está resuelto:

- No sabemos cuánto hielo hay realmente ni dónde.
- Perforar suelo congelado a −233 °C nunca se ha hecho en la Luna. En 2025, la misión IM-2 llevaba un taladro, pero el módulo volcó al aterrizar y no pudo usarlo.
- Dentro del cráter no hay energía solar.
- Limpiar el agua de mercurio y amoníaco con equipos de vuelo sigue en investigación.

Nuestra simulación usa valores físicos reales del suelo lunar, pero simplifica muchas cosas. Sus resultados no son mediciones.

---

## 9. Prototipo (20 s)

[Bajar a «Prototipo».]

Para demostrarlo físicamente, construimos un rover de mesa con un ESP32 sobre un lecho de arena con zonas húmedas o congeladas. Explora, detecta con un sensor de humedad, decide con las mismas reglas, perfora, pesa la muestra y recupera el agua por evaporación y condensación. Se conecta por USB a esta misma página.

---

## 10. Cierre (20 s)

Cada litro de agua que se obtenga en la Luna es un litro que no hay que lanzar desde la Tierra. Y con ese agua también se puede producir oxígeno para respirar e hidrógeno para combustible.

ICEWISE no promete que esto ya funcione. Propone cómo buscar, decidir y extraer con cuidado, y reconoce lo que todavía hay que investigar.

Muchas gracias.

---

## Preguntas probables del jurado

**¿El rover sabe dónde está el hielo?**
No. En la simulación, el hielo real está oculto. El rover solo recibe lecturas de su sensor, con ruido y atenuadas por la capa seca. Construye un mapa con esas lecturas, y la perforación confirma o descarta.

**¿Por qué no procesan el hielo dentro del cráter?**
Porque allí no hay energía solar. La estación está en la cresta iluminada, donde los paneles generan energía de forma casi continua.

**¿Cuánta agua se obtiene?**
En la simulación, unos 1,5 kg por viaje (3 perforaciones de 1 m, unos 41 kg de suelo con alrededor de 2 kg de hielo), a unos 3–4 kWh por kilo. Es un orden de magnitud de un modelo, no una medición.

**¿Qué hacen exactamente los microorganismos?**
Limpian el agua obtenida en un biofiltro sellado. *Pseudomonas* degrada el amoníaco y los compuestos orgánicos y de azufre; *Deinococcus* retiene el mercurio y resiste la radiación; el liquen *Placopsis* avisa si el agua sigue contaminada. La ventaja es que ahorran filtros químicos, que habría que traer desde la Tierra.

**¿Está demostrado que funcione?**
Las capacidades de los grupos sí están documentadas: *Deinococcus* se ha modificado para reducir mercurio (Brim et al., 2000, *Nature Biotechnology*) y los líquenes se usan como bioindicadores de azufre (Hawksworth & Rose, 1970, *Nature*). Que estas especies concretas lo hagan en un biofiltro lunar es una hipótesis que hay que probar en el laboratorio.

**¿Por qué no usan bacterias para sacar el hielo?**
Porque a −233 °C ningún ser vivo está activo, y convertir el hielo en vapor requiere calor. Los microorganismos solo pueden trabajar con agua líquida, a temperatura controlada, dentro de la estación.

**¿Y si los microbios contaminan el agua?**
Después del biofiltro hay filtros químicos, una membrana y luz ultravioleta que retiran las bacterias. Ese es también uno de los riesgos que hay que medir en los ensayos.

**¿El agua es potable?**
No automáticamente. La llamamos agua purificada. Para beberla habría que analizarla y certificarla según los estándares de vuelo tripulado.

**¿Ya existe algo parecido?**
Por partes. El proyecto europeo LUWEX extrajo y purificó agua de suelo lunar simulado en laboratorio (madurez tecnológica 4). La empresa Paragon probó trampas frías como etapa de purificación, y la NASA ensaya biorreactores que eliminan amoníaco del agua de las naves. Nadie ha extraído agua en la Luna, y no conocemos ningún sistema que una rover autónomo, planta, biofiltro y colonia como ICEWISE.

**¿El mapa es real?**
El relieve sí: son datos del altímetro láser LOLA (NASA), a 5 m por píxel, reducidos a 10 m para la simulación. Las sombras permanentes las calculamos con ese relieve. La cantidad de hielo dentro de ellas es simulada, porque ninguna misión la ha medido con ese detalle.

**¿Qué es original de ICEWISE?**
La integración del ciclo completo con decisiones explícitas (GO o NO-GO antes de perforar), la arquitectura energía arriba / hielo abajo y el modelo que conecta exploración y agua obtenida. Los sensores y el taladro se basan en tecnología existente.
