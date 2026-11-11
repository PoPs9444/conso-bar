import type { CardKey, Lang } from '../types'

// Every word the panel shows, per language. English is the default; another
// language is used only when Claude Code itself is set to it (see detectLang)

export type Strings = {
  fiveHour: string
  weekly: string
  // each limit's name inside the Limits card
  limitNames: { five_hour: string; seven_day: string }
  session: string
  forecastIn: (span: string) => string
  atReset: (p: number) => string
  fullIn: (span: string) => string
  cost: string
  units: { d: string; h: string; m: string; s: string }
  history: string
  today: string
  week: string
  // one letter per weekday, Sunday first (Date#getDay)
  days: readonly string[]
  context: string
  tokens: string
  agents: string
  running: (n: number) => string
  finished: (n: number) => string
  noAgents: string
  moreAgents: (n: number) => string
  showMore: string
  showLess: string
  system: string
  cores: (n: number) => string
  // a figure the machine does not give
  na: string
  // the apps outside the top ones
  other: string
  gb: string
  status: { done: string; failed: string; aborted: string; stopping: string; running: string }
  // the level takes the color, the word stays white; some languages put the word first
  effort: { word: string; isWordFirst: boolean; low: string; medium: string; high: string; xhigh: string; max: string }
  thinking: string
  step: (n: number) => string
  compact: string
  compacting: string
  clear: string
  stop: string
  update: string
  checkUpdates: string
  checking: string
  customize: string
  hide: string
  show: string
  // after a hidden card's name in Customize
  hiddenTag: string
  done: string
  upToDate: string
  checkFailed: string
  available: (v: string) => string
  newVersion: (v: string) => string
  updating: (v: string) => string
  installed: (v: string) => string
  // under the banner once installed: no reload, nothing in the conversation
  nextConversation: string
  // after the version in the footer, once installed
  ready: (v: string) => string
  githubAnswered: (code: number) => string
  noVersion: string
  compactFailed: (m: string) => string
  updateFailed: (m: string) => string
  noClaude: string
  waiting: string
  nothingYet: string
  drawFailed: (why: string) => string
  cards: Record<CardKey, string>
  command: string
  opened: string
  band: { session: string; h5: string; week: string; context: string }
}

const en: Strings = {
  fiveHour: '5-hour limit',
  weekly: 'Weekly limit',
  limitNames: { five_hour: '5-hour', seven_day: 'Weekly' },
  session: 'Session',
  forecastIn: s => `Forecast in ${s}`,
  atReset: p => `≈ ${p}% at reset`,
  fullIn: s => `100% in ≈ ${s}`,
  cost: 'cost',
  units: { d: 'd', h: 'h', m: 'm', s: 's' },
  history: 'History',
  today: 'Today',
  week: '7 days',
  days: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  context: 'Context',
  tokens: 'tokens',
  agents: 'Agents',
  running: n => `${n} running`,
  finished: n => `${n} done`,
  noAgents: 'No agents in this session yet',
  moreAgents: n => `and ${n} more`,
  showMore: 'Show more',
  showLess: 'Show less',
  system: 'System',
  cores: n => `${n} cores`,
  na: 'n/a',
  other: 'Other',
  gb: 'GB',
  status: { done: 'Done', failed: 'Failed', aborted: 'Stopped', stopping: 'Stopping…', running: 'Running' },
  effort: { word: 'effort', isWordFirst: false, low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' },
  thinking: 'Thinking',
  step: n => (n === 1 ? 'step' : 'steps'),
  compact: 'Compact',
  compacting: 'Compacting…',
  clear: 'Clear',
  stop: 'Stop',
  update: 'Update',
  checkUpdates: 'Check for updates',
  checking: 'Checking…',
  customize: 'Customize',
  hide: 'Hide',
  show: 'Show',
  hiddenTag: 'hidden',
  done: 'Done',
  upToDate: 'Up to date',
  checkFailed: 'Update check failed',
  available: v => `v${v} available`,
  newVersion: v => `New version v${v}`,
  updating: v => `Updating to v${v}…`,
  installed: v => `v${v} installed`,
  nextConversation: 'Takes effect in your next conversation',
  ready: v => `v${v} ready`,
  githubAnswered: c => `GitHub answered ${c}`,
  noVersion: 'no version found on GitHub',
  compactFailed: m => `Compact failed: ${m}`,
  updateFailed: m => `Update failed: ${m}`,
  noClaude: "Claude Code's command line was not found",
  waiting: 'Waiting for the first reply…',
  nothingYet: 'Nothing to show yet',
  drawFailed: (why: string) => `Conso could not draw this panel: ${why}`,
  cards: { limits: 'Limits', context: 'Context', system: 'System', history: 'History', agents: 'Agents' },
  command: 'Show the Conso panel',
  opened: 'Conso panel opened.',
  band: { session: 'Session', h5: '5h', week: 'Week', context: 'Context' },
}

const fr: Strings = {
  fiveHour: 'Limite 5 h',
  weekly: 'Limite hebdo',
  limitNames: { five_hour: '5 heures', seven_day: 'Hebdo' },
  session: 'Session',
  forecastIn: s => `Prévision dans ${s}`,
  atReset: p => `≈ ${p}% à l'échéance`,
  fullIn: s => `100% dans ≈ ${s}`,
  cost: 'coût',
  units: { d: 'j', h: 'h', m: 'min', s: 's' },
  history: 'Historique',
  today: "Aujourd'hui",
  week: '7 jours',
  days: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
  context: 'Contexte',
  tokens: 'tokens',
  agents: 'Agents',
  running: n => `${n} en cours`,
  finished: n => `${n} terminé${n > 1 ? 's' : ''}`,
  noAgents: 'Aucun agent dans cette session',
  moreAgents: n => `et ${n} autre${n > 1 ? 's' : ''}`,
  showMore: 'Afficher plus',
  showLess: 'Réduire',
  system: 'Système',
  cores: n => `${n} cœurs`,
  na: 'indispo.',
  other: 'Autres',
  gb: 'Go',
  status: { done: 'Terminé', failed: 'Échec', aborted: 'Arrêté', stopping: 'Arrêt…', running: 'En cours' },
  effort: { word: 'Effort', isWordFirst: true, low: 'faible', medium: 'moyen', high: 'élevé', xhigh: 'très élevé', max: 'max' },
  thinking: 'Réflexion',
  step: n => (n > 1 ? 'étapes' : 'étape'),
  compact: 'Compacter',
  compacting: 'Compactage…',
  clear: 'Effacer',
  stop: 'Arrêter',
  update: 'Mettre à jour',
  checkUpdates: 'Vérifier les mises à jour',
  checking: 'Vérification…',
  customize: 'Personnaliser',
  hide: 'Masquer',
  show: 'Afficher',
  hiddenTag: 'masquée',
  done: 'Terminé',
  upToDate: 'À jour',
  checkFailed: 'Échec de la vérification',
  available: v => `v${v} disponible`,
  newVersion: v => `Nouvelle version v${v}`,
  updating: v => `Mise à jour vers v${v}…`,
  installed: v => `v${v} installée`,
  nextConversation: 'Active dès votre prochaine conversation',
  ready: v => `v${v} prête`,
  githubAnswered: c => `GitHub a répondu ${c}`,
  noVersion: 'aucune version trouvée sur GitHub',
  compactFailed: m => `Échec du compactage : ${m}`,
  updateFailed: m => `Échec de la mise à jour : ${m}`,
  noClaude: 'Ligne de commande de Claude Code introuvable',
  waiting: 'En attente de la première réponse…',
  nothingYet: 'Rien à afficher pour le moment',
  drawFailed: (why: string) => `Conso n'a pas pu dessiner ce panneau : ${why}`,
  cards: { limits: 'Limites', context: 'Contexte', system: 'Système', history: 'Historique', agents: 'Agents' },
  command: 'Afficher le panneau Conso',
  opened: 'Panneau Conso ouvert.',
  band: { session: 'Session', h5: '5h', week: 'Semaine', context: 'Contexte' },
}

const es: Strings = {
  fiveHour: 'Límite 5 h',
  weekly: 'Límite semanal',
  limitNames: { five_hour: '5 horas', seven_day: 'Semanal' },
  session: 'Sesión',
  forecastIn: s => `Previsión en ${s}`,
  atReset: p => `≈ ${p}% al reiniciar`,
  fullIn: s => `100% en ≈ ${s}`,
  cost: 'coste',
  units: { d: 'd', h: 'h', m: 'min', s: 's' },
  history: 'Historial',
  today: 'Hoy',
  week: '7 días',
  days: ['D', 'L', 'M', 'X', 'J', 'V', 'S'],
  context: 'Contexto',
  tokens: 'tokens',
  agents: 'Agentes',
  running: n => `${n} en curso`,
  finished: n => `${n} terminado${n > 1 ? 's' : ''}`,
  noAgents: 'Aún no hay agentes en esta sesión',
  moreAgents: n => `y ${n} más`,
  showMore: 'Mostrar más',
  showLess: 'Mostrar menos',
  system: 'Sistema',
  cores: n => `${n} núcleos`,
  na: 'n/d',
  other: 'Otros',
  gb: 'GB',
  status: { done: 'Hecho', failed: 'Error', aborted: 'Detenido', stopping: 'Deteniendo…', running: 'En curso' },
  effort: { word: 'Esfuerzo', isWordFirst: true, low: 'bajo', medium: 'medio', high: 'alto', xhigh: 'muy alto', max: 'máximo' },
  thinking: 'Razonamiento',
  step: n => (n === 1 ? 'paso' : 'pasos'),
  compact: 'Compactar',
  compacting: 'Compactando…',
  clear: 'Borrar',
  stop: 'Detener',
  update: 'Actualizar',
  checkUpdates: 'Buscar actualizaciones',
  checking: 'Buscando…',
  customize: 'Personalizar',
  hide: 'Ocultar',
  show: 'Mostrar',
  hiddenTag: 'oculta',
  done: 'Listo',
  upToDate: 'Actualizado',
  checkFailed: 'Error al buscar actualizaciones',
  available: v => `v${v} disponible`,
  newVersion: v => `Nueva versión v${v}`,
  updating: v => `Actualizando a v${v}…`,
  installed: v => `v${v} instalada`,
  nextConversation: 'Activa desde tu próxima conversación',
  ready: v => `v${v} lista`,
  githubAnswered: c => `GitHub respondió ${c}`,
  noVersion: 'no se encontró ninguna versión en GitHub',
  compactFailed: m => `Error al compactar: ${m}`,
  updateFailed: m => `Error al actualizar: ${m}`,
  noClaude: 'No se encontró la línea de comandos de Claude Code',
  waiting: 'Esperando la primera respuesta…',
  nothingYet: 'Nada que mostrar todavía',
  drawFailed: (why: string) => `Conso no pudo dibujar este panel: ${why}`,
  cards: { limits: 'Límites', context: 'Contexto', system: 'Sistema', history: 'Historial', agents: 'Agentes' },
  command: 'Mostrar el panel Conso',
  opened: 'Panel Conso abierto.',
  band: { session: 'Sesión', h5: '5h', week: 'Semana', context: 'Contexto' },
}

const de: Strings = {
  fiveHour: '5-Std.-Limit',
  weekly: 'Wochenlimit',
  limitNames: { five_hour: '5 Stunden', seven_day: 'Woche' },
  session: 'Sitzung',
  forecastIn: s => `Prognose in ${s}`,
  atReset: p => `≈ ${p}% beim Reset`,
  fullIn: s => `100% in ≈ ${s}`,
  cost: 'Kosten',
  units: { d: 'T', h: 'h', m: 'min', s: 's' },
  history: 'Verlauf',
  today: 'Heute',
  week: '7 Tage',
  days: ['S', 'M', 'D', 'M', 'D', 'F', 'S'],
  context: 'Kontext',
  tokens: 'Tokens',
  agents: 'Agenten',
  running: n => `${n} aktiv`,
  finished: n => `${n} fertig`,
  noAgents: 'Noch keine Agenten in dieser Sitzung',
  moreAgents: n => `und ${n} weitere`,
  showMore: 'Mehr anzeigen',
  showLess: 'Weniger anzeigen',
  system: 'System',
  cores: n => `${n} Kerne`,
  na: 'k. A.',
  other: 'Andere',
  gb: 'GB',
  status: { done: 'Fertig', failed: 'Fehler', aborted: 'Gestoppt', stopping: 'Wird gestoppt…', running: 'Aktiv' },
  effort: { word: 'Aufwand', isWordFirst: true, low: 'niedrig', medium: 'mittel', high: 'hoch', xhigh: 'sehr hoch', max: 'maximal' },
  thinking: 'Denken',
  step: n => (n === 1 ? 'Schritt' : 'Schritte'),
  compact: 'Komprimieren',
  compacting: 'Komprimiert…',
  clear: 'Leeren',
  stop: 'Stoppen',
  update: 'Aktualisieren',
  checkUpdates: 'Nach Updates suchen',
  checking: 'Suche…',
  customize: 'Anpassen',
  hide: 'Ausblenden',
  show: 'Einblenden',
  hiddenTag: 'ausgeblendet',
  done: 'Fertig',
  upToDate: 'Aktuell',
  checkFailed: 'Update-Prüfung fehlgeschlagen',
  available: v => `v${v} verfügbar`,
  newVersion: v => `Neue Version v${v}`,
  updating: v => `Aktualisierung auf v${v}…`,
  installed: v => `v${v} installiert`,
  nextConversation: 'Aktiv ab dem nächsten Gespräch',
  ready: v => `v${v} bereit`,
  githubAnswered: c => `GitHub antwortete ${c}`,
  noVersion: 'keine Version auf GitHub gefunden',
  compactFailed: m => `Komprimieren fehlgeschlagen: ${m}`,
  updateFailed: m => `Aktualisierung fehlgeschlagen: ${m}`,
  noClaude: 'Kommandozeile von Claude Code nicht gefunden',
  waiting: 'Warte auf die erste Antwort…',
  nothingYet: 'Noch nichts anzuzeigen',
  drawFailed: (why: string) => `Conso konnte dieses Panel nicht zeichnen: ${why}`,
  cards: { limits: 'Limits', context: 'Kontext', system: 'System', history: 'Verlauf', agents: 'Agenten' },
  command: 'Conso-Panel anzeigen',
  opened: 'Conso-Panel geöffnet.',
  band: { session: 'Sitzung', h5: '5h', week: 'Woche', context: 'Kontext' },
}

const it: Strings = {
  fiveHour: 'Limite 5 ore',
  weekly: 'Limite settimanale',
  limitNames: { five_hour: '5 ore', seven_day: 'Settimana' },
  session: 'Sessione',
  forecastIn: s => `Previsione tra ${s}`,
  atReset: p => `≈ ${p}% al reset`,
  fullIn: s => `100% tra ≈ ${s}`,
  cost: 'costo',
  units: { d: 'g', h: 'h', m: 'min', s: 's' },
  history: 'Cronologia',
  today: 'Oggi',
  week: '7 giorni',
  days: ['D', 'L', 'M', 'M', 'G', 'V', 'S'],
  context: 'Contesto',
  tokens: 'token',
  agents: 'Agenti',
  running: n => `${n} in corso`,
  finished: n => (n > 1 ? `${n} completati` : `${n} completato`),
  noAgents: 'Ancora nessun agente in questa sessione',
  moreAgents: n => `e altri ${n}`,
  showMore: 'Mostra altri',
  showLess: 'Mostra meno',
  system: 'Sistema',
  cores: n => `${n} core`,
  na: 'n/d',
  other: 'Altri',
  gb: 'GB',
  status: { done: 'Fatto', failed: 'Errore', aborted: 'Fermato', stopping: 'Arresto…', running: 'In corso' },
  effort: { word: 'Sforzo', isWordFirst: true, low: 'basso', medium: 'medio', high: 'alto', xhigh: 'molto alto', max: 'massimo' },
  thinking: 'Ragionamento',
  step: n => (n === 1 ? 'passo' : 'passi'),
  compact: 'Compatta',
  compacting: 'Compattazione…',
  clear: 'Cancella',
  stop: 'Ferma',
  update: 'Aggiorna',
  checkUpdates: 'Cerca aggiornamenti',
  checking: 'Ricerca…',
  customize: 'Personalizza',
  hide: 'Nascondi',
  show: 'Mostra',
  hiddenTag: 'nascosta',
  done: 'Fine',
  upToDate: 'Aggiornato',
  checkFailed: 'Verifica aggiornamenti non riuscita',
  available: v => `v${v} disponibile`,
  newVersion: v => `Nuova versione v${v}`,
  updating: v => `Aggiornamento a v${v}…`,
  installed: v => `v${v} installata`,
  nextConversation: 'Attiva dalla prossima conversazione',
  ready: v => `v${v} pronta`,
  githubAnswered: c => `GitHub ha risposto ${c}`,
  noVersion: 'nessuna versione trovata su GitHub',
  compactFailed: m => `Compattazione non riuscita: ${m}`,
  updateFailed: m => `Aggiornamento non riuscito: ${m}`,
  noClaude: 'Riga di comando di Claude Code non trovata',
  waiting: 'In attesa della prima risposta…',
  nothingYet: 'Ancora niente da mostrare',
  drawFailed: (why: string) => `Conso non ha potuto disegnare questo pannello: ${why}`,
  cards: { limits: 'Limiti', context: 'Contesto', system: 'Sistema', history: 'Cronologia', agents: 'Agenti' },
  command: 'Mostra il pannello Conso',
  opened: 'Pannello Conso aperto.',
  band: { session: 'Sessione', h5: '5h', week: 'Settimana', context: 'Contesto' },
}

const pt: Strings = {
  fiveHour: 'Limite 5 h',
  weekly: 'Limite semanal',
  limitNames: { five_hour: '5 horas', seven_day: 'Semanal' },
  session: 'Sessão',
  forecastIn: s => `Previsão em ${s}`,
  atReset: p => `≈ ${p}% no reinício`,
  fullIn: s => `100% em ≈ ${s}`,
  cost: 'custo',
  units: { d: 'd', h: 'h', m: 'min', s: 's' },
  history: 'Histórico',
  today: 'Hoje',
  week: '7 dias',
  days: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
  context: 'Contexto',
  tokens: 'tokens',
  agents: 'Agentes',
  running: n => `${n} em execução`,
  finished: n => `${n} concluído${n > 1 ? 's' : ''}`,
  noAgents: 'Ainda não há agentes nesta sessão',
  moreAgents: n => `e mais ${n}`,
  showMore: 'Mostrar mais',
  showLess: 'Mostrar menos',
  system: 'Sistema',
  cores: n => `${n} núcleos`,
  na: 'n/d',
  other: 'Outros',
  gb: 'GB',
  status: { done: 'Concluído', failed: 'Falhou', aborted: 'Parado', stopping: 'Parando…', running: 'Em execução' },
  effort: { word: 'Esforço', isWordFirst: true, low: 'baixo', medium: 'médio', high: 'alto', xhigh: 'muito alto', max: 'máximo' },
  thinking: 'Raciocínio',
  step: n => (n === 1 ? 'passo' : 'passos'),
  compact: 'Compactar',
  compacting: 'Compactando…',
  clear: 'Limpar',
  stop: 'Parar',
  update: 'Atualizar',
  checkUpdates: 'Verificar atualizações',
  checking: 'Verificando…',
  customize: 'Personalizar',
  hide: 'Ocultar',
  show: 'Mostrar',
  hiddenTag: 'oculto',
  done: 'Concluído',
  upToDate: 'Atualizado',
  checkFailed: 'Falha ao verificar atualizações',
  available: v => `v${v} disponível`,
  newVersion: v => `Nova versão v${v}`,
  updating: v => `Atualizando para v${v}…`,
  installed: v => `v${v} instalada`,
  nextConversation: 'Ativa a partir da próxima conversa',
  ready: v => `v${v} pronta`,
  githubAnswered: c => `GitHub respondeu ${c}`,
  noVersion: 'nenhuma versão encontrada no GitHub',
  compactFailed: m => `Falha ao compactar: ${m}`,
  updateFailed: m => `Falha na atualização: ${m}`,
  noClaude: 'Linha de comando do Claude Code não encontrada',
  waiting: 'Aguardando a primeira resposta…',
  nothingYet: 'Nada para mostrar ainda',
  drawFailed: (why: string) => `O Conso não conseguiu desenhar este painel: ${why}`,
  cards: { limits: 'Limites', context: 'Contexto', system: 'Sistema', history: 'Histórico', agents: 'Agentes' },
  command: 'Mostrar o painel Conso',
  opened: 'Painel Conso aberto.',
  band: { session: 'Sessão', h5: '5h', week: 'Semana', context: 'Contexto' },
}

export const STRINGS: Record<Lang, Strings> = { en, fr, es, de, it, pt }

// Each language by its code and by its name, in English and in the
// languages Conso speaks: what Claude Code's `language` setting may hold
const NAMES: Record<Lang, readonly string[]> = {
  en: ['en', 'english', 'anglais', 'inglés', 'ingles', 'englisch', 'inglese', 'inglês'],
  fr: ['fr', 'french', 'français', 'francais', 'francés', 'frances', 'französisch', 'francese', 'francês'],
  es: ['es', 'spanish', 'español', 'espanol', 'espagnol', 'castellano', 'spanisch', 'spagnolo', 'espanhol'],
  de: ['de', 'german', 'deutsch', 'allemand', 'alemán', 'aleman', 'tedesco', 'alemão'],
  it: ['it', 'italian', 'italiano', 'italien', 'italienisch'],
  pt: ['pt', 'portuguese', 'português', 'portugues', 'portugais', 'portugués', 'portugiesisch', 'portoghese'],
}

// "french", "Français", "fr", "fr-FR", "pt_BR.UTF-8" → the language; anything
// else → undefined
export const toLang = (value: unknown): Lang | undefined => {
  if (typeof value !== 'string') return undefined
  const s = value.trim().toLowerCase()
  if (!s) return undefined
  const head = s.split(/[\s\-_.@(]/)[0] ?? ''
  for (const lang of Object.keys(NAMES) as Lang[]) {
    if (NAMES[lang].includes(s) || NAMES[lang].includes(head)) return lang
  }
  return undefined
}
