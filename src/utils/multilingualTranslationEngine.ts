import { callGeminiWithResilience, hasValidGeminiApiKey } from '../services/gemini';

// Diccionario multilingüe de lemas y raíces literarias fundamentales
// Mapea conceptos universales a sus formas comunes en ES, EN, FR, DE, IT
export interface SemanticConcept {
  id: string;
  es: string[];
  en: string[];
  fr?: string[];
  de?: string[];
  it?: string[];
}

export const MULTILINGUAL_LEXICON: SemanticConcept[] = [
  // --- TEMPORALES, FECHAS Y MESES ---
  { id: 'month_jan', es: ['enero', 'ene'], en: ['january', 'jan'], fr: ['janvier'], de: ['januar'], it: ['gennaio'] },
  { id: 'month_feb', es: ['febrero', 'feb'], en: ['february', 'feb'], fr: ['février'], de: ['februar'], it: ['febbraio'] },
  { id: 'month_mar', es: ['marzo', 'mar'], en: ['march', 'mar'], fr: ['mars'], de: ['märz'], it: ['marzo'] },
  { id: 'month_apr', es: ['abril', 'abr'], en: ['april', 'apr'], fr: ['avril'], de: ['april'], it: ['aprile'] },
  { id: 'month_may', es: ['mayo', 'may'], en: ['may'], fr: ['mai'], de: ['mai'], it: ['maggio'] },
  { id: 'month_jun', es: ['junio', 'jun'], en: ['june', 'jun'], fr: ['juin'], de: ['juni'], it: ['giugno'] },
  { id: 'month_jul', es: ['julio', 'jul'], en: ['july', 'jul'], fr: ['juillet'], de: ['juli'], it: ['luglio'] },
  { id: 'month_aug', es: ['agosto', 'ago'], en: ['august', 'aug'], fr: ['août'], de: ['august'], it: ['agosto'] },
  { id: 'month_sep', es: ['septiembre', 'setiembre', 'sep', 'sept'], en: ['september', 'sep', 'sept'], fr: ['septembre'], de: ['september'], it: ['settembre'] },
  { id: 'month_oct', es: ['octubre', 'oct'], en: ['october', 'oct'], fr: ['octobre'], de: ['oktober'], it: ['ottobre'] },
  { id: 'month_nov', es: ['noviembre', 'nov'], en: ['november', 'nov'], fr: ['novembre'], de: ['november'], it: ['novembre'] },
  { id: 'month_dec', es: ['diciembre', 'dic'], en: ['december', 'dec'], fr: ['décembre'], de: ['dezember'], it: ['dicembre'] },

  { id: 'day_mon', es: ['lunes'], en: ['monday'], fr: ['lundi'], de: ['montag'], it: ['lunedì'] },
  { id: 'day_tue', es: ['martes'], en: ['tuesday'], fr: ['mardi'], de: ['dienstag'], it: ['martedì'] },
  { id: 'day_wed', es: ['miércoles', 'miercoles'], en: ['wednesday'], fr: ['mercredi'], de: ['mittwoch'], it: ['mercoledì'] },
  { id: 'day_thu', es: ['jueves'], en: ['thursday'], fr: ['jeudi'], de: ['donnerstag'], it: ['giovedì'] },
  { id: 'day_fri', es: ['viernes'], en: ['friday'], fr: ['vendredi'], de: ['freitag'], it: ['venerdì'] },
  { id: 'day_sat', es: ['sábado', 'sabado'], en: ['saturday'], fr: ['samedi'], de: ['samstag'], it: ['sabato'] },
  { id: 'day_sun', es: ['domingo'], en: ['sunday'], fr: ['dimanche'], de: ['sonntag'], it: ['domenica'] },

  { id: 'time_today', es: ['hoy'], en: ['today'], fr: ["aujourd'hui"], de: ['heute'], it: ['oggi'] },
  { id: 'time_yesterday', es: ['ayer'], en: ['yesterday'], fr: ['hier'], de: ['gestern'], it: ['ieri'] },
  { id: 'time_tomorrow', es: ['mañana', 'manana'], en: ['tomorrow'], fr: ['demain'], de: ['morgen'], it: ['domani'] },
  { id: 'time_morning', es: ['mañana', 'manana', 'madrugada'], en: ['morning', 'dawn'], fr: ['matin', 'matinée', 'aube'], de: ['morgen', 'früh'], it: ['mattina', 'alba'] },
  { id: 'time_noon', es: ['mediodía', 'mediodia'], en: ['noon', 'midday'], fr: ['midi'], de: ['mittag'], it: ['mezzogiorno'] },
  { id: 'time_evening', es: ['tarde', 'atardecer', 'anochecer'], en: ['evening', 'afternoon', 'dusk'], fr: ['soir', 'soirée', 'crépuscule'], de: ['abend', 'nachmittag'], it: ['sera', 'pomeriggio'] },
  { id: 'time_night', es: ['noche', 'medianoche'], en: ['night', 'midnight'], fr: ['nuit', 'minuit'], de: ['nacht', 'mitternacht'], it: ['notte', 'mezzanotte'] },
  { id: 'time_year', es: ['año', 'anos', 'años'], en: ['year', 'years'], fr: ['an', 'année', 'ans'], de: ['jahr', 'jahre'], it: ['anno', 'anni'] },
  { id: 'time_century', es: ['siglo', 'siglos'], en: ['century', 'centuries'], fr: ['siècle', 'siècles'], de: ['jahrhundert'], it: ['secolo', 'secoli'] },
  { id: 'time_hour', es: ['hora', 'horas'], en: ['hour', 'hours', 'o\'clock'], fr: ['heure', 'heures'], de: ['stunde', 'stunden', 'uhr'], it: ['ora', 'ore'] },
  { id: 'time_moment', es: ['momento', 'instante', 'segundo'], en: ['moment', 'instant', 'second'], fr: ['moment', 'instant'], de: ['moment', 'augenblick'], it: ['momento', 'istante'] },
  { id: 'time_now', es: ['ahora', 'actualmente'], en: ['now', 'presently', 'at present'], fr: ['maintenant', 'à présent'], de: ['jetzt', 'nun'], it: ['adesso', 'ora'] },
  { id: 'time_then', es: ['entonces', 'luego', 'después', 'despues'], en: ['then', 'afterwards', 'later'], fr: ['alors', 'ensuite', 'puis', 'après'], de: ['dann', 'damals', 'danach'], it: ['allora', 'poi', 'dopo'] },
  { id: 'time_always', es: ['siempre'], en: ['always', 'ever'], fr: ['toujours'], de: ['immer'], it: ['sempre'] },
  { id: 'time_never', es: ['nunca', 'jamás', 'jamas'], en: ['never'], fr: ['jamais'], de: ['nie', 'niemals'], it: ['mai'] },
  { id: 'time_suddenly', es: ['de repente', 'súbitamente', 'repentinamente'], en: ['suddenly', 'all at once', 'abruptly'], fr: ['soudain', 'brusquement', 'tout à coup'], de: ['plötzlich', 'auf einmal'], it: ['improvvisamente', 'all\'improvviso'] },

  // --- DISCURSO, DIÁLOGO Y NARRACIÓN ---
  { id: 'say_verb', es: ['dijo', 'decía', 'decia', 'dice', 'dicho', 'dijeron', 'decir'], en: ['said', 'says', 'saying', 'say', 'spoke', 'speak'], fr: ['dit', 'disait', 'dire'], de: ['sagte', 'sprach', 'sagen'], it: ['disse', 'diceva', 'dire'] },
  { id: 'ask_verb', es: ['preguntó', 'pregunto', 'preguntaba', 'inquirió', 'interrogó'], en: ['asked', 'inquiring', 'questioned', 'ask'], fr: ['demanda', 'interrogea'], de: ['fragte', 'erkundigte'], it: ['chiese', 'domandò'] },
  { id: 'reply_verb', es: ['respondió', 'respondio', 'contestó', 'contesto', 'replicó', 'replico'], en: ['replied', 'answered', 'retorted'], fr: ['répondit', 'répliqua'], de: ['antwortete', 'erwiderte'], it: ['rispose', 'replicò'] },
  { id: 'whisper_verb', es: ['susurró', 'susurro', 'murmuró', 'murmuro'], en: ['whispered', 'murmured', 'muttered'], fr: ['chuchota', 'murmura'], de: ['flüsterte', 'murmelte'], it: ['sussurrò', 'mormorò'] },
  { id: 'exclaim_verb', es: ['exclamó', 'exclamo', 'gritó', 'grito'], en: ['exclaimed', 'cried', 'shouted', 'yelled'], fr: ['s\'exclama', 'cria'], de: ['rief', 'schrie'], it: ['esclamò', 'gridò'] },
  { id: 'think_verb', es: ['pensó', 'penso', 'pensaba', 'creyó', 'creyo', 'reflexionó'], en: ['thought', 'believed', 'reflected', 'considered'], fr: ['pensa', 'crut', 'réfléchit'], de: ['dachte', 'glaubte'], it: ['pensò', 'credette'] },
  { id: 'know_verb', es: ['sabía', 'sabia', 'supo', 'conocía', 'conocia'], en: ['knew', 'known', 'understood'], fr: ['savait', 'connaissait', 'sut'], de: ['wusste', 'kannte'], it: ['sapeva', 'conosceva'] },
  { id: 'see_verb', es: ['vio', 'veía', 'veia', 'miró', 'miro', 'observó', 'observo'], en: ['saw', 'seen', 'looked', 'watched', 'gazed'], fr: ['vit', 'voyait', 'regarda'], de: ['sah', 'blickte', 'schaute'], it: ['vide', 'guardò', 'osservò'] },
  { id: 'hear_verb', es: ['oyó', 'oyo', 'escuchó', 'escucho', 'sentía'], en: ['heard', 'listened'], fr: ['entendit', 'écouta'], de: ['hörte', 'lauschte'], it: ['udì', 'ascoltò'] },
  { id: 'feel_verb', es: ['sintió', 'sintio', 'sentía', 'sentia'], en: ['felt', 'feeling', 'sensed'], fr: ['sentit', 'éprouva'], de: ['fühlte', 'spürte'], it: ['sentì', 'provò'] },

  // --- MOVIMIENTO Y ACCIONES ---
  { id: 'go_verb', es: ['fue', 'iba', 'marchó', 'marcho', 'partió', 'partio'], en: ['went', 'gone', 'departed', 'left'], fr: ['alla', 'partit', 's\'en alla'], de: ['ging', 'reiste', 'verließ'], it: ['andò', 'partì'] },
  { id: 'come_verb', es: ['vino', 'venía', 'venia', 'llegó', 'llego'], en: ['came', 'arrived'], fr: ['vint', 'arriva'], de: ['kam', 'kam an'], it: ['venne', 'arrivò'] },
  { id: 'enter_verb', es: ['entró', 'entro', 'entraba', 'penetró'], en: ['entered', 'stepped in', 'came in'], fr: ['entra', 'pénétra'], de: ['trat ein', 'betrat'], it: ['entrò'] },
  { id: 'leave_verb', es: ['salió', 'salio', 'abandonó', 'abandono', 'dejó', 'dejo'], en: ['left', 'walked out', 'exited', 'abandoned'], fr: ['sortit', 'quitta'], de: ['verließ', 'ging hinaus'], it: ['uscì', 'lasciò'] },
  { id: 'descend_verb', es: ['descendió', 'descendio', 'descendieron', 'bajó', 'bajo', 'bajaron'], en: ['descended', 'stepped down', 'alighted', 'climbed down'], fr: ['descendit', 'descendirent'], de: ['stieg hinab', 'stiegen hinab'], it: ['scese', 'scesero'] },
  { id: 'knock_verb', es: ['llamó', 'llamo', 'llamaron', 'golpeó', 'golpeo', 'golpearon', 'aldaba'], en: ['knocked', 'knocker', 'rapped'], fr: ['frappa', 'frappèrent'], de: ['klopfte', 'klopften'], it: ['bussò', 'bussarono'] },
  { id: 'say_verb', es: ['dijo', 'decía', 'decia', 'preguntó', 'pregunto', 'contestó', 'contesto', 'respondió', 'respondio', 'susurró', 'susurro'], en: ['said', 'asked', 'replied', 'answered', 'whispered', 'murmured'], fr: ['dit', 'demanda', 'répondit', 'chuchota'], de: ['sagte', 'fragte', 'antwortete', 'flüsterte'], it: ['disse', 'chiese', 'rispose', 'sussurrò'] },
  { id: 'stand_verb', es: ['se levantó', 'se levanto', 'puso de pie', 'estaba de pie'], en: ['stood', 'stood up', 'rose', 'arose'], fr: ['se leva', 'se dressa'], de: ['stand auf', 'erhob sich'], it: ['si alzò'] },
  { id: 'sit_verb', es: ['se sentó', 'se sento', 'sentado'], en: ['sat', 'sat down', 'seated'], fr: ['s\'assit', 'assis'], de: ['setzte sich', 'saß'], it: ['si sedette', 'seduto'] },
  { id: 'walk_verb', es: ['caminó', 'camino', 'anduvo', 'avanzó', 'avanzo'], en: ['walked', 'stepped', 'advanced'], fr: ['marcha', 'avança'], de: ['ging', 'schritt'], it: ['camminò', 'avanzò'] },
  { id: 'run_verb', es: ['corrió', 'corrio', 'huyó', 'huyo'], en: ['ran', 'fled', 'rushed'], fr: ['courut', 's\'enfuit'], de: ['lief', 'rannte'], it: ['corse', 'fuggì'] },
  { id: 'stop_verb', es: ['se detuvo', 'se paró', 'paró'], en: ['stopped', 'paused', 'halted'], fr: ['s\'arrêta', 's\'interrompit'], de: ['hielt an', 'stoppte'], it: ['si fermò'] },
  { id: 'open_verb', es: ['abrió', 'abrio', 'abierto'], en: ['opened', 'open'], fr: ['ouvrit', 'ouvert'], de: ['öffnete', 'offen'], it: ['aprì', 'aperto'] },
  { id: 'close_verb', es: ['cerró', 'cerro', 'cerrado'], en: ['closed', 'shut'], fr: ['ferma', 'clos'], de: ['schloss', 'zu'], it: ['chiuse', 'chiuso'] },
  { id: 'take_verb', es: ['tomó', 'tomo', 'cogió', 'cogio', 'agarró'], en: ['took', 'grasped', 'seized'], fr: ['prit', 'saisit'], de: ['nahm', 'ergriff'], it: ['prese', 'afferrò'] },
  { id: 'give_verb', es: ['dio', 'daba', 'entregó', 'entrego'], en: ['gave', 'given', 'handed'], fr: ['donna', 'remit'], de: ['gab', 'überreichte'], it: ['diede', 'consegnò'] },
  { id: 'find_verb', es: ['encontró', 'encontro', 'halló', 'hallo'], en: ['found', 'discovered'], fr: ['trouva', 'découvrit'], de: ['fand', 'entdeckte'], it: ['trovò', 'scoprì'] },
  { id: 'begin_verb', es: ['comenzó', 'comenzo', 'empezó', 'empezo', 'inició'], en: ['began', 'started', 'commenced'], fr: ['commença', 'débuta'], de: ['begann', 'fing an'], it: ['cominciò', 'iniziò'] },
  { id: 'end_verb', es: ['terminó', 'termino', 'acabó', 'acabo', 'concluyó'], en: ['ended', 'finished', 'concluded'], fr: ['finit', 'termina'], de: ['endete', 'schloss'], it: ['finì', 'terminò'] },
  { id: 'live_verb', es: ['vivía', 'vivia', 'vivió', 'vivio', 'vida'], en: ['lived', 'living', 'life'], fr: ['vivait', 'vécut', 'vie'], de: ['lebte', 'leben'], it: ['viveva', 'visse', 'vita'] },
  { id: 'die_verb', es: ['murió', 'murio', 'muerto', 'muerte'], en: ['died', 'dead', 'death'], fr: ['mourut', 'mort'], de: ['starb', 'tot', 'tod'], it: ['morì', 'morto', 'morte'] },

  // --- PERSONAJES Y SERES ---
  { id: 'char_man', es: ['hombre', 'hombres', 'caballero', 'señor'], en: ['man', 'men', 'gentleman', 'sir', 'mister'], fr: ['homme', 'monsieur'], de: ['mann', 'herr'], it: ['uomo', 'signore'] },
  { id: 'char_woman', es: ['mujer', 'mujeres', 'dama', 'señora'], en: ['woman', 'women', 'lady', 'madam'], fr: ['femme', 'dame'], de: ['frau', 'dame'], it: ['donna', 'signora'] },
  { id: 'char_boy', es: ['muchacho', 'chico', 'niño', 'joven'], en: ['boy', 'lad', 'youngster', 'child'], fr: ['garçon', 'enfant'], de: ['junge', 'knabe'], it: ['ragazzo', 'bambino'] },
  { id: 'char_girl', es: ['muchacha', 'chica', 'niña'], en: ['girl', 'maiden'], fr: ['fille', 'jeune fille'], de: ['mädchen'], it: ['ragazza', 'bambina'] },
  { id: 'char_father', es: ['padre', 'papá'], en: ['father', 'dad'], fr: ['père'], de: ['vater'], it: ['padre'] },
  { id: 'char_mother', es: ['madre', 'mamá'], en: ['mother', 'mom'], fr: ['mère'], de: ['mutter'], it: ['madre'] },
  { id: 'char_son', es: ['hijo', 'hijos'], en: ['son', 'sons'], fr: ['fils'], de: ['sohn'], it: ['figlio'] },
  { id: 'char_daughter', es: ['hija', 'hijas'], en: ['daughter', 'daughters'], fr: ['fille'], de: ['tochter'], it: ['figlia'] },
  { id: 'char_brother', es: ['hermano', 'hermanos'], en: ['brother', 'brothers'], fr: ['frère'], de: ['bruder'], it: ['fratello'] },
  { id: 'char_sister', es: ['hermana', 'hermanas'], en: ['sister', 'sisters'], fr: ['soeur'], de: ['schwester'], it: ['sorella'] },
  { id: 'char_friend', es: ['amigo', 'amiga', 'amigos'], en: ['friend', 'friends', 'companion'], fr: ['ami', 'compagnon'], de: ['freund'], it: ['amico'] },
  { id: 'char_enemy', es: ['enemigo', 'rival'], en: ['enemy', 'foe', 'rival'], fr: ['ennemi'], de: ['feind'], it: ['nemico'] },
  { id: 'char_king', es: ['rey', 'reina'], en: ['king', 'queen'], fr: ['roi', 'reine'], de: ['könig', 'königin'], it: ['re', 'regina'] },
  { id: 'char_captain', es: ['capitán', 'capitan'], en: ['captain'], fr: ['capitaine'], de: ['kapitän'], it: ['capitano'] },
  { id: 'char_doctor', es: ['médico', 'medico', 'doctor'], en: ['doctor', 'physician'], fr: ['médecin', 'docteur'], de: ['arzt', 'doktor'], it: ['dottore', 'medico'] },

  // --- LUGARES Y ENTORNO ---
  { id: 'place_house', es: ['casa', 'hogar', 'residencia'], en: ['house', 'home', 'residence'], fr: ['maison', 'demeure'], de: ['haus', 'heim'], it: ['casa', 'dimora'] },
  { id: 'place_room', es: ['habitación', 'habitacion', 'cuarto', 'sala', 'aposento'], en: ['room', 'chamber', 'parlor'], fr: ['chambre', 'pièce', 'salle'], de: ['zimmer', 'raum', 'saal'], it: ['stanza', 'camera', 'sala'] },
  { id: 'place_door', es: ['puerta', 'portón'], en: ['door', 'gate', 'doorway'], fr: ['porte'], de: ['tür', 'tor'], it: ['porta', 'portone'] },
  { id: 'place_window', es: ['ventana'], en: ['window'], fr: ['fenêtre'], de: ['fenster'], it: ['finestra'] },
  { id: 'place_street', es: ['calle', 'avenida', 'camino'], en: ['street', 'road', 'avenue', 'way', 'path'], fr: ['rue', 'chemin', 'route'], de: ['straße', 'weg'], it: ['strada', 'via'] },
  { id: 'place_city', es: ['ciudad', 'pueblo', 'aldea'], en: ['city', 'town', 'village'], fr: ['ville', 'village'], de: ['stadt', 'dorf'], it: ['città', 'paese', 'villaggio'] },
  { id: 'place_sea', es: ['mar', 'océano', 'playa', 'costa'], en: ['sea', 'ocean', 'shore', 'coast'], fr: ['mer', 'océan'], de: ['meer', 'see', 'ozean'], it: ['mare', 'oceano'] },
  { id: 'place_forest', es: ['bosque', 'selva', 'árboles'], en: ['forest', 'woods', 'trees'], fr: ['forêt', 'bois'], de: ['wald', 'bäume'], it: ['foresta', 'bosco'] },

  // --- CUERPO Y OBJETOS ---
  { id: 'body_eyes', es: ['ojos', 'mirada'], en: ['eyes', 'gaze', 'glance'], fr: ['yeux', 'regard'], de: ['augen', 'blick'], it: ['occhi', 'sguardo'] },
  { id: 'body_face', es: ['rostro', 'cara', 'semblante'], en: ['face', 'countenance'], fr: ['visage', 'face'], de: ['gesicht'], it: ['volto', 'faccia'] },
  { id: 'body_hand', es: ['mano', 'manos', 'dedos'], en: ['hand', 'hands', 'fingers'], fr: ['main', 'mains'], de: ['hand', 'hände'], it: ['mano', 'mani'] },
  { id: 'body_head', es: ['cabeza'], en: ['head'], fr: ['tête'], de: ['kopf'], it: ['testa', 'capo'] },
  { id: 'body_voice', es: ['voz', 'tono'], en: ['voice', 'tone'], fr: ['voix', 'ton'], de: ['stimme', 'ton'], it: ['voce', 'tono'] },
  { id: 'body_heart', es: ['corazón', 'corazon', 'pecho'], en: ['heart', 'breast', 'chest'], fr: ['coeur', 'poitrine'], de: ['herz', 'brust'], it: ['cuore', 'petto'] },
  { id: 'item_letter', es: ['carta', 'epístola', 'misiva'], en: ['letter', 'epistle', 'missive'], fr: ['lettre'], de: ['brief'], it: ['lettera'] },
  { id: 'item_book', es: ['libro', 'volumen', 'tomo', 'páginas'], en: ['book', 'volume', 'pages'], fr: ['livre', 'tome', 'pages'], de: ['buch', 'band'], it: ['libro', 'volume', 'pagine'] },

  // --- CONECTORES ADVERSATIVOS Y LÓGICOS ---
  { id: 'conn_but', es: ['pero', 'mas', 'sin embargo', 'no obstante', 'empero'], en: ['but', 'however', 'yet', 'nevertheless'], fr: ['mais', 'cependant', 'toutefois'], de: ['aber', 'doch', 'jedoch'], it: ['ma', 'però', 'tuttavia'] },
  { id: 'conn_because', es: ['porque', 'pues', 'ya que', 'puesto que'], en: ['because', 'for', 'since', 'as'], fr: ['parce que', 'car', 'puisque'], de: ['weil', 'denn', 'da'], it: ['perché', 'poiché', 'giacché'] },
  { id: 'conn_although', es: ['aunque', 'si bien', 'a pesar de'], en: ['although', 'though', 'even though', 'despite'], fr: ['bien que', 'quoique', 'malgré'], de: ['obwohl', 'obgleich'], it: ['sebbene', 'benché', 'nonostante'] },
  { id: 'conn_if', es: ['si'], en: ['if', 'whether'], fr: ['si'], de: ['wenn', 'ob'], it: ['se'] },

  // --- ATMÓSFERA, SONIDO Y PERCEPCIÓN ---
  { id: 'sound_silence', es: ['silencio', 'silencioso', 'callado', 'mudo'], en: ['silence', 'silent', 'quiet', 'mute'], fr: ['silence', 'silencieux'], de: ['stille', 'schweigen'], it: ['silenzio', 'silenzioso'] },
  { id: 'action_return', es: ['regresó', 'regreso', 'volvió', 'volvio', 'retornó', 'retorno'], en: ['returned', 'return', 'came back', 'went back'], fr: ['revint', 'retourna'], de: ['kehrte zurück'], it: ['tornò', 'ritornò'] },
  { id: 'quality_old', es: ['viejo', 'vieja', 'antiguo', 'antigua', 'anciano', 'anciana'], en: ['old', 'ancient', 'elderly', 'aged'], fr: ['vieux', 'vieille', 'ancien'], de: ['alt'], it: ['vecchio', 'antico'] },
  { id: 'quality_new', es: ['nuevo', 'nueva', 'joven', 'reciente'], en: ['new', 'young', 'fresh', 'recent'], fr: ['nouveau', 'nouvelle', 'jeune'], de: ['neu', 'jung'], it: ['nuovo', 'giovane'] },
  { id: 'place_chamber', es: ['estancia', 'aposento', 'habitación', 'sala', 'cuarto'], en: ['chamber', 'room', 'hall', 'parlor'], fr: ['chambre', 'pièce'], de: ['kammer', 'saal'], it: ['stanza', 'camera'] },
  { id: 'weather_storm', es: ['temporal', 'tormenta', 'tempestad', 'vendaval'], en: ['tempest', 'storm', 'gale'], fr: ['tempête'], de: ['sturm'], it: ['tempesta'] },
  { id: 'weather_wind', es: ['viento', 'brisa', 'aire', 'huracán'], en: ['wind', 'breeze', 'gale', 'hurricane'], fr: ['vent'], de: ['wind'], it: ['vento'] },
  { id: 'action_delay', es: ['demorado', 'demoró', 'demoro', 'demorar', 'retrasado', 'retrasó', 'retraso'], en: ['delayed', 'delay', 'delays', 'postponed', 'held up'], fr: ['retardé', 'retarda'], de: ['verzögert'], it: ['ritardato'] },
  { id: 'place_channel', es: ['canal', 'estrecho', 'paso'], en: ['channel', 'canal', 'strait'], fr: ['canal', 'manche'], de: ['kanal'], it: ['canale'] },
  { id: 'action_cross', es: ['cruce', 'cruzar', 'cruzó', 'cruzo', 'atravesar'], en: ['crossing', 'cross', 'crossed', 'passage'], fr: ['traversée'], de: ['überquerung'], it: ['attraversamento'] },
  { id: 'item_clock', es: ['reloj', 'péndulo', 'cronómetro'], en: ['clock', 'pendulum', 'watch', 'timepiece'], fr: ['horloge', 'pendule', 'montre'], de: ['uhr'], it: ['orologio'] },
  { id: 'season_autumn', es: ['otoño', 'otono'], en: ['autumn', 'fall'], fr: ['automne'], de: ['herbst'], it: ['autunno'] },
  { id: 'season_spring', es: ['primavera'], en: ['spring'], fr: ['printemps'], de: ['frühling'], it: ['primavera'] },
  { id: 'season_summer', es: ['verano'], en: ['summer'], fr: ['été'], de: ['sommer'], it: ['estate'] },
  { id: 'season_winter', es: ['invierno'], en: ['winter'], fr: ['hiver'], de: ['winter'], it: ['inverno'] },
  { id: 'element_fire', es: ['fuego', 'chimenea', 'hoguera', 'llama', 'llamas'], en: ['fire', 'fireplace', 'hearth', 'flame', 'flames'], fr: ['feu', 'cheminée'], de: ['feuer', 'kamin'], it: ['fuoco', 'camino'] },
  { id: 'vehicle_carriage', es: ['carruaje', 'carro', 'coche', 'diligencia'], en: ['carriage', 'coach', 'cart'], fr: ['voiture', 'carrosse'], de: ['kutsche', 'wagen'], it: ['carrozza'] },
  { id: 'char_butler', es: ['mayordomo', 'sirviente', 'criado', 'lacayo'], en: ['butler', 'servant', 'valet', 'footman'], fr: ['majordome', 'domestique'], de: ['butler', 'diener'], it: ['maggiordomo', 'servo'] },
  { id: 'char_nobility', es: ['marqués', 'marques', 'conde', 'duque', 'señor', 'marquesa'], en: ['marquis', 'marquess', 'count', 'duke', 'lord', 'nobleman'], fr: ['marquis', 'duc', 'comte'], de: ['markgraf', 'fürst', 'graf'], it: ['marchese', 'duca', 'conte'] },
  { id: 'finance_bank', es: ['banco', 'bancario', 'financiero'], en: ['bank', 'banking', 'banker'], fr: ['banque'], de: ['bank'], it: ['banca'] },
  { id: 'info_news', es: ['noticia', 'noticias', 'novedad'], en: ['news', 'tidings', 'word'], fr: ['nouvelles'], de: ['nachrichten'], it: ['notizie'] },
  { id: 'item_desk', es: ['escritorio', 'mesa', 'bufete'], en: ['desk', 'table'], fr: ['bureau', 'table'], de: ['schreibtisch'], it: ['scrivania', 'tavolo'] },
  { id: 'visual_shadow', es: ['sombra', 'sombras', 'penumbra', 'oscuridad'], en: ['shadow', 'shadows', 'gloom', 'shade', 'darkness'], fr: ['ombre', 'ténèbres'], de: ['schatten', 'dunkelheit'], it: ['ombra', 'oscurità'] },
  { id: 'place_garden', es: ['jardín', 'jardin', 'jardines', 'parque'], en: ['garden', 'gardens', 'grounds', 'park'], fr: ['jardin'], de: ['garten'], it: ['giardino'] },
  { id: 'item_bell', es: ['campana', 'campanas', 'campanada'], en: ['bell', 'bells', 'chime', 'chimes'], fr: ['cloche'], de: ['glocke'], it: ['campana'] },
  { id: 'place_church', es: ['abadía', 'abadia', 'iglesia', 'catedral', 'convento'], en: ['abbey', 'church', 'cathedral', 'monastery'], fr: ['abbaye', 'église'], de: ['abtei', 'kirche'], it: ['abbazia', 'chiesa'] },
  { id: 'item_doc', es: ['documento', 'documentos', 'papel', 'papeles', 'escrito'], en: ['document', 'documents', 'paper', 'papers', 'record'], fr: ['document', 'papiers'], de: ['dokument', 'papiere'], it: ['documento', 'carte'] }
];

// Mapa rápido indexado de palabras normalizadas a IDs de conceptos semánticos
const WORD_TO_CONCEPT_MAP: Map<string, string[]> = new Map();

// Construcción del índice invertido
(function initLexiconIndex() {
  for (const item of MULTILINGUAL_LEXICON) {
    const allWords = [
      ...(item.es || []),
      ...(item.en || []),
      ...(item.fr || []),
      ...(item.de || []),
      ...(item.it || [])
    ];
    for (const raw of allWords) {
      const norm = normalizeWord(raw);
      if (norm.length >= 2) {
        const existing = WORD_TO_CONCEPT_MAP.get(norm) || [];
        if (!existing.includes(item.id)) {
          existing.push(item.id);
          WORD_TO_CONCEPT_MAP.set(norm, existing);
        }
      }
    }
  }
})();

/**
 * Normaliza una palabra para cotejo insensible a mayúsculas, tildes y diacríticos
 */
export function normalizeWord(word: string): string {
  return (word || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Extrae tokens normalizados significativos de una frase
 */
export function extractCleanTokens(text: string): string[] {
  if (!text) return [];
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2);
}

const WRITTEN_NUMBERS_MAP: Record<string, string> = {
  'uno': '1', 'una': '1', 'un': '1', 'one': '1', 'ein': '1', 'eins': '1',
  'dos': '2', 'two': '2', 'deux': '2', 'zwei': '2', 'due': '2',
  'tres': '3', 'three': '3', 'trois': '3', 'drei': '3', 'tre': '3',
  'cuatro': '4', 'four': '4', 'quatre': '4', 'vier': '4', 'quattro': '4',
  'cinco': '5', 'five': '5', 'cinq': '5', 'fünf': '5', 'cinque': '5',
  'seis': '6', 'six': '6', 'sechs': '6', 'sei': '6',
  'siete': '7', 'seven': '7', 'sept': '7', 'sieben': '7', 'sette': '7',
  'ocho': '8', 'eight': '8', 'huit': '8', 'acht': '8', 'otto': '8',
  'nueve': '9', 'nine': '9', 'neuf': '9', 'neun': '9', 'nove': '9',
  'diez': '10', 'ten': '10', 'dix': '10', 'zehn': '10', 'dieci': '10',
  'doce': '12', 'twelve': '12', 'douze': '12', 'zwölf': '12', 'dodici': '12',
  'veinte': '20', 'twenty': '20', 'vingt': '20', 'zwanzig': '20', 'venti': '20'
};

/**
 * Detecta números arábigos y romanos, años y fechas exactas en el texto
 */
export function extractNumbersAndDates(text: string): {
  numbers: string[];
  years: string[];
  romanNumerals: string[];
} {
  const clean = text || '';
  const numRegex = /\b\d{1,6}\b/g;
  const romanRegex = /\b[IVXLCDM]{2,8}\b/gi;
  
  const rawNumbers = (clean.match(numRegex) || []).map(n => n.toLowerCase());
  
  // Extraer números escritos en palabras y normalizarlos a dígitos equivalentes
  const words = clean.toLowerCase().replace(/[^a-z0-9áéíóúñäöüß]/g, ' ').split(/\s+/).filter(Boolean);
  for (const w of words) {
    const mapped = Object.prototype.hasOwnProperty.call(WRITTEN_NUMBERS_MAP, w) ? WRITTEN_NUMBERS_MAP[w] : undefined;
    if (mapped && !rawNumbers.includes(mapped)) {
      rawNumbers.push(mapped);
    }
  }

  const numbers = rawNumbers;
  const years = numbers.filter(n => {
    const val = parseInt(n, 10);
    return val >= 1200 && val <= 2099;
  });
  const romanNumerals = (clean.match(romanRegex) || []).map(r => r.toUpperCase());

  return { numbers, years, romanNumerals };
}

/**
 * Extrae entidades nombradas y nombres propios (capitalizados) ignorando artículos
 */
export function extractProperNames(str: string): string[] {
  if (!str) return [];
  const words = str.split(/\s+/).filter(Boolean);
  const names: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const clean = words[i].replace(/[^\p{L}]/gu, '');
    if (clean.length >= 3 && /^\p{Lu}/u.test(clean)) {
      if (i === 0 && /^(?:el|la|los|las|un|una|the|a|an|der|die|das|ein|le|la|les|un|une|il|lo|la|i|gli|le)$/i.test(clean)) {
        continue;
      }
      names.push(clean.toLowerCase());
    }
  }
  return Array.from(new Set(names));
}

/**
 * Evalúa rigurosamente la concordancia semántica y de traducción entre dos frases (ej. frase inicial A vs frase inicial B).
 * Devuelve un score numérico y un desglose detallado con garantía de que:
 * - Si una frase tiene una fecha o número que NO está en la otra, o viceversa, penaliza severamente (evita cortes erróneos).
 * - Si comparten lemas traducidos reales del diccionario multilingüe, puntúa fuertemente.
 * - Detecta cognados y entidades nombradas literarias.
 */
export function evaluateMultilingualPhraseConcordance(
  phraseA: string,
  phraseB: string
): {
  score: number;
  isMatch: boolean;
  sharedConcepts: string[];
  sharedEntities: string[];
  sharedNumbers: string[];
  dateMismatch: boolean;
  reason: string;
} {
  const pA = (phraseA || '').trim();
  const pB = (phraseB || '').trim();

  if (!pA || !pB) {
    return {
      score: 0,
      isMatch: false,
      sharedConcepts: [],
      sharedEntities: [],
      sharedNumbers: [],
      dateMismatch: false,
      reason: 'Una de las frases está vacía'
    };
  }

  let score = 0;

  // 1. ANÁLISIS DE FECHAS Y NÚMEROS (INVARIANTE DE ORO)
  const mathA = extractNumbersAndDates(pA);
  const mathB = extractNumbersAndDates(pB);

  let sharedNums: string[] = [];
  let dateMismatch = false;

  for (const n of mathA.numbers) {
    if (mathB.numbers.includes(n)) {
      sharedNums.push(n);
      score += (mathA.years.includes(n) ? 35 : 22); // Años como 1885 o 1912 son anclas casi infalibles
    }
  }

  // Si una frase termina o contiene una fecha y la otra NO la contiene, penalización severa
  if (mathA.years.length > 0 && mathB.years.length === 0) {
    score -= 28;
    dateMismatch = true;
  } else if (mathB.years.length > 0 && mathA.years.length === 0) {
    score -= 28;
    dateMismatch = true;
  } else if (mathA.years.length > 0 && mathB.years.length > 0 && sharedNums.length === 0) {
    // Ambas tienen fechas, pero son DIFERENTES (ej. 1885 vs 1892)
    score -= 35;
    dateMismatch = true;
  }

  // 2. CONCORDANCIA POR DICCIONARIO SEMÁNTICO MULTILINGÜE
  const tokensA = extractCleanTokens(pA);
  const tokensB = extractCleanTokens(pB);

  const conceptsA = new Set<string>();
  for (const tok of tokensA) {
    const ids = WORD_TO_CONCEPT_MAP.get(tok);
    if (ids) {
      for (const id of ids) conceptsA.add(id);
    }
  }

  const conceptsB = new Set<string>();
  for (const tok of tokensB) {
    const ids = WORD_TO_CONCEPT_MAP.get(tok);
    if (ids) {
      for (const id of ids) conceptsB.add(id);
    }
  }

  const sharedConcepts: string[] = [];
  for (const c of conceptsA) {
    if (conceptsB.has(c)) {
      sharedConcepts.push(c);
      score += 18; // Cada concepto traducido validado suma 18 puntos
    }
  }

  // 3. ENTIDADES NOMBRADAS Y NOMBRES PROPIOS (Capitalizados)
  const namesA = extractProperNames(pA);
  const namesB = extractProperNames(pB);
  const sharedEntities: string[] = [];

  for (const na of namesA) {
    if (namesB.includes(na) || namesB.some(nb => nb.slice(0, 4) === na.slice(0, 4) && na.length >= 4)) {
      sharedEntities.push(na);
      score += 24;
    }
  }

  // 4. ESTRUCTURA DE DIÁLOGO HOMÓLOGA
  const hasDialA = /^[—–\-«"“'„]/.test(pA) || /[—–«»"“]/.test(pA);
  const hasDialB = /^[—–\-«"“'„]/.test(pB) || /[—–«»"“]/.test(pB);
  if (hasDialA && hasDialB) {
    score += 8;
  }

  // 5. SIGNOS DE INTERROGACIÓN O EXCLAMACIÓN
  const isQA = /^[¿¡!?]/.test(pA) || /[!?]$/.test(pA);
  const isQB = /^[¿¡!?]/.test(pB) || /[!?]$/.test(pB);
  if (isQA && isQB) {
    score += 6;
  }

  // 6. COGNADOS Y RAÍCES CRUZADAS
  let cognatesFound = 0;
  for (const ta of tokensA) {
    if (ta.length >= 4) {
      const root = ta.slice(0, 4);
      if (tokensB.some(tb => tb.length >= 4 && (tb.startsWith(root) || ta.startsWith(tb.slice(0, 4))))) {
        cognatesFound++;
      }
    }
  }
  score += Math.min(32, cognatesFound * 12);

  // DETERMINACIÓN FINAL DE MATCH REAL
  // Umbral calibrado: requiere evidencia sustancial de traducción, entidades, números o cognados
  const hasSubstantialEvidence = sharedConcepts.length > 0 || sharedEntities.length > 0 || sharedNums.length > 0 || cognatesFound >= 1;
  const isMatch = !dateMismatch && score >= 12 && hasSubstantialEvidence;

  let reason = '';
  if (dateMismatch) {
    reason = 'Discrepancia en fecha o año detectado';
  } else if (isMatch) {
    reason = `Correspondencia semántica confirmada: ${sharedConcepts.length} conceptos, ${sharedEntities.length} entidades, ${sharedNums.length} números, ${cognatesFound} cognados`;
  } else {
    reason = 'Evidencia semántica insuficiente entre ambas frases';
  }

  return {
    score,
    isMatch,
    sharedConcepts,
    sharedEntities,
    sharedNumbers: sharedNums,
    dateMismatch,
    reason
  };
}

/**
 * Traduce texto de forma gratuita, ligera e ilimitada (0 tokens de IA consumidos)
 * utilizando el endpoint público de traducción web de Google Translate.
 * Permite traducir miles de páginas o anclas de párrafo sin agotar la cuota de modelos.
 */
export function getIsoLangCode(l: string): string {
  const s = (l || '').toLowerCase();
  if (s.includes('es') || s.includes('span')) return 'es';
  if (s.includes('en') || s.includes('ingl')) return 'en';
  if (s.includes('de') || s.includes('alem') || s.includes('ger')) return 'de';
  if (s.includes('fr') || s.includes('fran')) return 'fr';
  if (s.includes('it') || s.includes('ital')) return 'it';
  if (s.includes('pt') || s.includes('port')) return 'pt';
  return l.slice(0, 2) || 'auto';
}

/**
 * Traductor gratuito por lotes de alta velocidad (0 tokens).
 * Agrupa párrafos en paquetes de ~2200 caracteres con delimitadores y ejecuta
 * en paralelo concurrente (hasta 4 workers), reduciendo el tiempo de minutos a segundos.
 */
export async function translateBatchFree(
  paragraphs: string[],
  fromLang: string = 'auto',
  toLang: string = 'en',
  onBatchProgress?: (completed: number, total: number) => void
): Promise<string[]> {
  if (!paragraphs || paragraphs.length === 0) return [];
  const sl = getIsoLangCode(fromLang);
  const tl = getIsoLangCode(toLang);
  if (sl === tl) return [...paragraphs];

  const DELIM = '\n\n<<<P_SEP>>>\n\n';
  const batches: { indices: number[]; combinedText: string }[] = [];
  let currentIndices: number[] = [];
  let currentText = '';

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const trimmed = p.trim();
    if (!trimmed) continue;

    if (currentText.length + trimmed.length + DELIM.length > 2200 && currentIndices.length > 0) {
      batches.push({ indices: currentIndices, combinedText: currentText });
      currentIndices = [i];
      currentText = trimmed;
    } else {
      currentIndices.push(i);
      currentText = currentText ? `${currentText}${DELIM}${trimmed}` : trimmed;
    }
  }
  if (currentIndices.length > 0) {
    batches.push({ indices: currentIndices, combinedText: currentText });
  }

  const results: string[] = [...paragraphs];
  let completedBatches = 0;
  const CONCURRENCY = 4;

  for (let b = 0; b < batches.length; b += CONCURRENCY) {
    const chunk = batches.slice(b, b + CONCURRENCY);
    await Promise.all(chunk.map(async (batch) => {
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(batch.combinedText)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && Array.isArray(data[0])) {
            const joined = data[0].map((item: any) => item[0]).join('');
            const parts = joined.split(/<<<P_SEP>>>/);
            for (let k = 0; k < batch.indices.length; k++) {
              const origIdx = batch.indices[k];
              const t = parts[k]?.trim();
              if (t) {
                results[origIdx] = t;
              }
            }
          }
        }
      } catch (e) {
        // Fallback al texto original si el lote falla
      }
      completedBatches++;
      onBatchProgress?.(completedBatches, batches.length);
    }));
  }

  return results;
}

export interface TurboTranslationProgress {
  completed: number;
  total: number;
  percent: number;
  currentSnippet: string;
  macroDetail: string;
  nanoToken?: string;
}

/**
 * Traductor turbo industrial para libros completos.
 * Ofrece dos modos acelerados:
 * 1. 'google_turbo': Lotes concurrentes HTML/texto con Google Translate (0 tokens, ~5-10 segundos por libro).
 * 2. 'gemini_macro': Traducción documental de capítulos completos con Gemini 2.5 Flash (~3-5 seg por capítulo).
 */
export async function translateParagraphsTurbo(options: {
  paragraphs: string[];
  fromLang?: string;
  toLang?: string;
  engine?: 'google_turbo' | 'gemini_macro';
  onProgress?: (prog: TurboTranslationProgress) => void;
}): Promise<string[]> {
  const {
    paragraphs,
    fromLang = 'auto',
    toLang = 'en',
    engine = 'google_turbo',
    onProgress
  } = options;

  if (!paragraphs || paragraphs.length === 0) return [];

  const sl = getIsoLangCode(fromLang);
  const tl = getIsoLangCode(toLang);
  if (sl === tl) return [...paragraphs];

  const total = paragraphs.length;

  // -------------------------------------------------------------------------
  // MODO 1: GEMINI MACRO (TRADUCCIÓN DOCUMENTAL POR CAPÍTULOS/BLOQUES)
  // -------------------------------------------------------------------------
  if (engine === 'gemini_macro' && hasValidGeminiApiKey()) {
    try {
      const results: string[] = new Array(total).fill('');
      const CHUNK_CHAR_LIMIT = 14000;
      const macroBatches: { startIdx: number; endIdx: number; text: string }[] = [];

      let curBatchText = '';
      let curStart = 0;

      for (let i = 0; i < total; i++) {
        const p = paragraphs[i].trim();
        if (curBatchText.length + p.length > CHUNK_CHAR_LIMIT && i > curStart) {
          macroBatches.push({ startIdx: curStart, endIdx: i - 1, text: curBatchText });
          curBatchText = `[[P_${i}]] ${p}`;
          curStart = i;
        } else {
          curBatchText = curBatchText ? `${curBatchText}\n\n[[P_${i}]] ${p}` : `[[P_${i}]] ${p}`;
        }
      }
      if (curStart < total) {
        macroBatches.push({ startIdx: curStart, endIdx: total - 1, text: curBatchText });
      }

      for (let bIdx = 0; bIdx < macroBatches.length; bIdx++) {
        const b = macroBatches[bIdx];
        const pct = Math.round(((bIdx) / macroBatches.length) * 100);

        onProgress?.({
          completed: b.startIdx,
          total,
          percent: pct,
          currentSnippet: paragraphs[b.startIdx]?.slice(0, 50) || '',
          macroDetail: `Traduciendo macro-bloque ${bIdx + 1} de ${macroBatches.length} con Gemini 2.5 Flash...`,
          nanoToken: `Lote ${b.startIdx + 1}-${b.endIdx + 1}`
        });

        // Yield al event loop para fluidez UI
        await new Promise(r => setTimeout(r, 10));

        const prompt = `Actúa como traductor literario forense y editor editorial.
Traduce el siguiente fragmento literario de ${fromLang} a ${toLang}.
REGLAS ESTRICTAS DE CONSERVACIÓN:
1. Cada párrafo está precedido por un marcador único "[[P_X]]". DEBES PRESERVAR cada marcador exacto "[[P_X]]" antes de la traducción de su párrafo.
2. Mantén exactamente el mismo número y orden de párrafos.
3. No resumas, no omitas diálogos ni oraciones.

TEXTO A TRADUCIR:
"""
${b.text}
"""`;

        const res = await callGeminiWithResilience({
          model: 'gemini-2.5-flash',
          contents: prompt
        });

        const reply = res?.text || '';
        const markerRegex = /\[\[P_(\d+)\]\]\s*([\s\S]*?)(?=(?:\[\[P_\d+\]\]|$))/g;
        let match: RegExpExecArray | null;
        let foundAny = false;

        while ((match = markerRegex.exec(reply)) !== null) {
          const idx = parseInt(match[1], 10);
          const trans = match[2]?.trim();
          if (idx >= 0 && idx < total && trans) {
            results[idx] = trans;
            foundAny = true;
          }
        }

        // Si Gemini no respetó los marcadores, dividir por saltos dobles de línea
        if (!foundAny) {
          const rawParas = reply.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
          const batchCount = b.endIdx - b.startIdx + 1;
          for (let k = 0; k < batchCount; k++) {
            results[b.startIdx + k] = rawParas[k] || paragraphs[b.startIdx + k];
          }
        }

        onProgress?.({
          completed: b.endIdx + 1,
          total,
          percent: Math.round(((bIdx + 1) / macroBatches.length) * 100),
          currentSnippet: paragraphs[b.endIdx]?.slice(0, 50) || '',
          macroDetail: `Completado macro-bloque ${bIdx + 1} de ${macroBatches.length}`,
          nanoToken: `Lote ${b.startIdx + 1}-${b.endIdx + 1} procesado`
        });
      }

      // Rellenar cualquier párrafo residual no traducido
      for (let i = 0; i < total; i++) {
        if (!results[i]) results[i] = paragraphs[i];
      }

      return results;
    } catch (e) {
      console.warn('Error en Gemini Macro Translation, ejecutando fallback a Google Turbo:', e);
    }
  }

  // -------------------------------------------------------------------------
  // MODO 2: GOOGLE TURBO (LOTES HTML / DELIMITADOS CON CONCURRENCIA PARALELA - 0 TOKENS)
  // -------------------------------------------------------------------------
  const DELIM = '\n\n<<<P_SEP>>>\n\n';
  const batches: { indices: number[]; combinedText: string }[] = [];
  let currentIndices: number[] = [];
  let currentText = '';

  // Paquetes de hasta 2000 caracteres para garantizar 100% éxito sin límites de URL GET
  const BATCH_CHAR_LIMIT = 2000;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (!p) continue;

    if (currentText.length + p.length + DELIM.length > BATCH_CHAR_LIMIT && currentIndices.length > 0) {
      batches.push({ indices: currentIndices, combinedText: currentText });
      currentIndices = [i];
      currentText = p;
    } else {
      currentIndices.push(i);
      currentText = currentText ? `${currentText}${DELIM}${p}` : p;
    }
  }
  if (currentIndices.length > 0) {
    batches.push({ indices: currentIndices, combinedText: currentText });
  }

  const results: string[] = [...paragraphs];
  let completedCount = 0;
  const CONCURRENCY = 5;

  for (let b = 0; b < batches.length; b += CONCURRENCY) {
    const chunk = batches.slice(b, b + CONCURRENCY);

    // Yield para que el hilo principal del navegador respire y la UI nunca se congele
    await new Promise(r => setTimeout(r, 6));

    await Promise.all(chunk.map(async (batch) => {
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(batch.combinedText)}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && Array.isArray(data[0])) {
            const joined = data[0].map((item: any) => item[0]).join('');
            const parts = joined.split(/<<<P_SEP>>>/);
            for (let k = 0; k < batch.indices.length; k++) {
              const origIdx = batch.indices[k];
              const t = parts[k]?.trim();
              if (t) {
                results[origIdx] = t;
              }
            }
          }
        }
      } catch (e) {
        // En caso de fallo de red aislado, mantiene el texto original
      }

      completedCount += batch.indices.length;
      const pct = Math.min(100, Math.round((completedCount / total) * 100));
      const firstIdx = batch.indices[0] || 0;

      onProgress?.({
        completed: completedCount,
        total,
        percent: pct,
        currentSnippet: (paragraphs[firstIdx] || '').slice(0, 45) + '...',
        macroDetail: `Traduciendo por lotes concurrentes (${completedCount}/${total} párrafos)...`,
        nanoToken: `Lote de ${batch.indices.length} párrafos`
      });
    }));
  }

  return results;
}

export async function translateTextFree(
  text: string,
  fromLang: string = 'auto',
  toLang: string = 'en'
): Promise<string> {
  if (!text || !text.trim()) return '';
  const sl = getIsoLangCode(fromLang);
  const tl = getIsoLangCode(toLang);
  if (sl === tl) return text;

  const paragraphs = text.split(/\n\s*\n+/);
  const translated = await translateBatchFree(paragraphs, sl, tl);
  return translated.join('\n\n');
}

/**
 * Evalúa la similitud léxica y sintáctica exacta entre Texto A y Texto B
 * utilizando las traducciones sombra (Shadow Translations) en ambas direcciones:
 * - A (Idioma A) vs Shadow B_in_A (Idioma A)
 * - B (Idioma B) vs Shadow A_in_B (Idioma B)
 * Brinda precisión matemática de correspondencia 1:1 en el mismo idioma con 0 tokens de IA.
 */
export function computeShadowSentenceSimilarity(
  textA: string,
  textB: string,
  shadowA_in_B?: string,
  shadowB_in_A?: string
): number {
  if (!textA || !textB) return 0;
  let totalScore = 0;
  let factors = 0;

  const tokenize = (s: string) => {
    return s.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3);
  };

  const jaccard = (tokens1: string[], tokens2: string[]) => {
    if (tokens1.length === 0 || tokens2.length === 0) return 0;
    const s1 = new Set(tokens1);
    const s2 = new Set(tokens2);
    let inter = 0;
    for (const w of s1) {
      if (s2.has(w)) inter++;
    }
    const union = new Set([...s1, ...s2]).size;
    return union > 0 ? (inter / union) : 0;
  };

  // Comparación 1: Texto A vs Sombra B en Idioma A
  if (shadowB_in_A && shadowB_in_A.trim()) {
    const tA = tokenize(textA);
    const tB_in_A = tokenize(shadowB_in_A);
    const simA = jaccard(tA, tB_in_A);
    totalScore += simA * 100;
    factors++;
  }

  // Comparación 2: Texto B vs Sombra A en Idioma B
  if (shadowA_in_B && shadowA_in_B.trim()) {
    const tB = tokenize(textB);
    const tA_in_B = tokenize(shadowA_in_B);
    const simB = jaccard(tB, tA_in_B);
    totalScore += simB * 100;
    factors++;
  }

  if (factors > 0) {
    return Math.round(totalScore / factors);
  }

  // Fallback nativo: concordancia lematizada multilingüe
  const multi = evaluateMultilingualPhraseConcordance(textA, textB);
  return Math.min(100, Math.max(0, multi.score * 2));
}

