// ═══════════════════════════════════════════════════════════════════
//  CORE / CONFIG — Configuration centrale v5
// ═══════════════════════════════════════════════════════════════════

const SUPABASE_URL  = 'https://iiswzieybgcqrywvopsf.supabase.co';
const SUPABASE_ANON = 'sb_publishable_xAV0yF6Ag6_fz_dBY3MpYw_PU7qKKjM';

window._supabase = (typeof supabase !== 'undefined')
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
  : null;

window.APP = {
  name:     'DjamikShop',
  version:  '1.1',
  currency: 'FCFA',
  demoMode: false,

  // URL de la fonction edge "share" qui sert un HTML avec OG dynamiques
  // pour les previews WhatsApp/Facebook. Voir supabase/functions/share/.
  shareEndpoint: SUPABASE_URL + '/functions/v1/share',

  // Push notifications (Web Push + VAPID)
  // Clé publique VAPID — peut être exposée côté client en toute sécurité.
  // La clé privée correspondante reste sur le serveur (Edge Function send-push).
  vapidPublicKey: 'BKhqK_XDWJzNjfm4MAZd1F4kUou-6GabKRvHMDUWY66ipMGgVrnTKYJTNVpHcapNMA_mGF0Fn4L0Fh6lIal9bqA',
  pushEndpoint:   SUPABASE_URL + '/functions/v1/send-push',

  cities: [
    'Niamey','Zinder','Maradi','Tahoua','Agadez','Dosso','Diffa',
    'Tillabéri','Birni-N\'Konni','Arlit'
  ],

  categories: [
    { id: 'electronique', label: 'Électronique',    icon: window.ICONS.smartphone, color: '#3B82F6' },
    { id: 'vehicules',    label: 'Véhicules',        icon: window.ICONS.car, color: '#10B981' },
    { id: 'immobilier',   label: 'Immobilier',       icon: window.ICONS.home, color: '#8B5CF6' },
    { id: 'mode',         label: 'Mode & Beauté',    icon: window.ICONS.shirt, color: '#EC4899' },
    { id: 'maison',       label: 'Maison',           icon: window.ICONS.sofa, color: '#F59E0B' },
    { id: 'agriculture',  label: 'Agriculture',      icon: window.ICONS.wheat, color: '#65A30D' },
    { id: 'services',     label: 'Services',         icon: window.ICONS.wrench, color: '#0891B2' },
    { id: 'enfants',      label: 'Enfants & Bébé',   icon: window.ICONS.children, color: '#F97316' },
    { id: 'sport',        label: 'Sport & Loisirs',  icon: window.ICONS.sport, color: '#06B6D4' },
    { id: 'divers',       label: 'Divers',           icon: window.ICONS.package, color: '#6B7280' }
  ],

  conditions: [
    { id: 'neuf',         label: 'Neuf',             badge: 'success' },
    { id: 'tres_bon',     label: 'Très bon état',    badge: 'info' },
    { id: 'bon',          label: 'Bon état',         badge: 'info' },
    { id: 'correct',      label: 'État correct',     badge: 'warning' },
    { id: 'occasion',     label: 'Pour pièces',      badge: 'danger' }
  ],

  // ── Mode de paiement pour les VENTES entre acheteur/vendeur ──
  // DjamikShop NE GERE PAS la transaction directe (securite des users).
  // Seuls les modes "rencontre physique" sont proposes - les users negocient eux-memes.
  // Mynita/Amanata sont utilises UNIQUEMENT pour les abonnements VIP/Premium (voir pages/payment.html).
  paymentMethods: [
    { id: 'cod',          label: 'Paiement à la livraison', icon: window.ICONS.banknote,  color: '#059669', desc: 'Payer à réception', mobile: false },
    { id: 'main_propre',  label: 'En main propre',          icon: window.ICONS.handshake, color: '#6B7280', desc: 'Rencontre vendeur', mobile: false }
  ]
};
