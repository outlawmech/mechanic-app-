import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpenIcon,
  BoxIcon,
  CheckIcon,
  ClipboardIcon,
  HelpCircleIcon,
  MonitorIcon,
  ReceiptIcon,
  ScanIcon,
  SmartphoneIcon,
  SparklesIcon,
  TagIcon,
  UsersIcon,
  WrenchIcon,
} from '../components/icons';
import { Card, PageTitle } from '../components/ui';
import { useShopSettings } from '../lib/settings';

export default function Help() {
  const { settings } = useShopSettings();
  const [activeTab, setActiveTab] = useState<
    'solo' | 'dealer' | 'parts' | 'offline' | 'hardware' | 'support'
  >(settings.enable_dealership_mode ? 'dealer' : 'solo');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PageTitle
            title="Shop &amp; Dealership Knowledge Base"
            sub="No-nonsense operating guides, workflows, and hardware setup built for real shop life."
          />
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-slate-800 transition"
          >
            <WrenchIcon className="h-4 w-4 text-orange-400" />
            <span>Shop Settings</span>
          </Link>
        </div>
      </div>

      {/* Category Navigation Pills */}
      <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-none text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('solo')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 whitespace-nowrap transition ${
            activeTab === 'solo'
              ? 'bg-orange-500 text-slate-950 font-black shadow-md shadow-orange-500/20'
              : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>🚛 Solo Rig Quick-Start</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('dealer')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 whitespace-nowrap transition ${
            activeTab === 'dealer'
              ? 'bg-purple-700 text-white font-black shadow-md shadow-purple-700/20'
              : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>🏢 Dealership &amp; DMS</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('parts')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 whitespace-nowrap transition ${
            activeTab === 'parts'
              ? 'bg-orange-500 text-slate-950 font-black shadow-md shadow-orange-500/20'
              : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>📦 Parts, Scanner &amp; POS</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('offline')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 whitespace-nowrap transition ${
            activeTab === 'offline'
              ? 'bg-orange-500 text-slate-950 font-black shadow-md shadow-orange-500/20'
              : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>📶 100% Offline Guide</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('hardware')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 whitespace-nowrap transition ${
            activeTab === 'hardware'
              ? 'bg-orange-500 text-slate-950 font-black shadow-md shadow-orange-500/20'
              : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>🖨️ Hardware &amp; Printers</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('support')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 whitespace-nowrap transition ${
            activeTab === 'support'
              ? 'bg-slate-900 text-white font-black shadow-md'
              : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>💬 Direct Founder Support</span>
        </button>
      </div>

      {/* TAB 1: SOLO RIG WORKFLOW */}
      {activeTab === 'solo' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <Card className="p-6 space-y-4 border-l-4 border-l-orange-500">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-orange-100 text-orange-800 font-bold">
                1
              </span>
              <h3 className="text-base font-black text-slate-900">
                10-Second Service Call Workflow
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Outlaw Shop Systems is designed to let you handle intake, diagnostic work, customer authorization, and invoicing in seconds from an Android phone or tablet.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <span className="font-mono text-[10px] font-black uppercase text-orange-600">Step 1</span>
                <p className="text-xs font-bold text-slate-900">Intake &amp; VIN Decode</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Add customer name and tap <strong>"Decode VIN/HIN"</strong>. NHTSA automatically pulls exact Year, Make, Model, and engine specs.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <span className="font-mono text-[10px] font-black uppercase text-orange-600">Step 2</span>
                <p className="text-xs font-bold text-slate-900">Open Repair Order</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Tap <strong>"+ Start RO"</strong> directly on the customer vehicle card. Add labor lines and scan parts from truck stock.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <span className="font-mono text-[10px] font-black uppercase text-orange-600">Step 3</span>
                <p className="text-xs font-bold text-slate-900">Sign-Off on Glass</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Customer signs with their finger on your phone glass. Time, date, and signature are permanently locked into the ticket.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <span className="font-mono text-[10px] font-black uppercase text-orange-600">Step 4</span>
                <p className="text-xs font-bold text-slate-900">Get Paid 0% Fees</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Tap <strong>"Generate Invoice"</strong>. Text the invoice or print it. Customers can pay via your Zelle, Venmo, Cash App, or credit card link.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-3">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckIcon className="h-4 w-4 text-emerald-500" /> Setting Your Default Labor Rate &amp; Payment Handles
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Go to <strong>Settings</strong> to set your shop hourly rate (e.g. $95/hr or $140/hr) and state sales tax. Add your Zelle phone/email and Venmo username so they print automatically at the bottom of every customer invoice.
            </p>
          </Card>
        </div>
      )}

      {/* TAB 2: DEALERSHIP DMS */}
      {activeTab === 'dealer' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <Card className="p-6 space-y-4 border-l-4 border-l-purple-600">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-purple-100 text-purple-800 font-bold">
                🏢
              </span>
              <h3 className="text-base font-black text-slate-900">
                Dealership Showroom &amp; Floorplan Operations
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              The Dealership &amp; Multi-Tech DMS transforms Outlaw Shop Systems into a full-scale dealership management suite covering showroom inventory, desking, floorplan lines, and PDI dispatch.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <p className="text-xs font-bold text-slate-900">🏦 Floorplan Financing &amp; Curtailments</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Log floored units with their lender (e.g. Northpoint, Wells Fargo CDF, Octane) and curtailment due date. The dashboard warns you <strong>30 days in advance</strong> before interest spikes.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <p className="text-xs font-bold text-slate-900">📝 1-Page Buyer's Orders</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Desk deals with unit price, freight, dealer prep, doc fees, trade-in equity, lien payoffs, and down payments. Capture buyer e-signatures and print full Bills of Sale.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <p className="text-xs font-bold text-slate-900">⚡ 1-Tap PDI Dispatch</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  When a crate arrives, tap <strong>"Dispatch PDI"</strong> on the unit card to automatically generate an uncrate, assembly, battery prep, and fluid fill Repair Order for your service techs.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-3">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TagIcon className="h-4 w-4 text-purple-600" /> Printable Showroom Spec Stickers &amp; Price Tags
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              From the <strong>Showroom Floor</strong> tab (`/sales`), tap the 🏷️ icon on any unit to generate a clean, printable handlebar hangtag or window spec sheet complete with MSRP, VIN, engine specs, and dealer contact info.
            </p>
          </Card>
        </div>
      )}

      {/* TAB 3: PARTS, SCANNER & POS */}
      {activeTab === 'parts' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <Card className="p-6 space-y-4 border-l-4 border-l-orange-500">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-orange-100 text-orange-800 font-bold">
                📦
              </span>
              <h3 className="text-base font-black text-slate-900">
                Parts Department, Smart Scanner &amp; POS Register
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Engineered for fast counter sales, mobile truck stock, and multi-thousand SKU dealership inventories.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <p className="text-xs font-bold text-slate-900">📖 OEM Master Price Books</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Upload master price files directly from <strong>Suzuki Connect, Honda iN, Polaris DEX, Yamaha YDS, or WPS</strong>. Look up 100,000+ manufacturer parts offline with zero manual typing.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <p className="text-xs font-bold text-slate-900">📷 Dual-Mode Camera Scanner</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Tap <strong>"📷 Scan Barcode / OCR"</strong>. Scan UPC barcodes, or switch to <strong>OCR Text Mode</strong> to read stamped or printed part numbers on greasy boxes and cast parts without barcodes.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <p className="text-xs font-bold text-slate-900">📂 Bulk CSV Migration</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Tap <strong>"📂 Import CSV"</strong> to migrate your entire inventory from Lightspeed, CDK, DealerTrack, QuickBooks, or Excel in seconds with duplicate protection.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <p className="text-xs font-bold text-slate-900">⚡ New Part Invoice</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Use <strong>New Part Invoice</strong> (`/parts/counter`) to ring up walk-in retail sales, calculate change, apply discounts, and print/text receipts in 30 seconds.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <p className="text-xs font-bold text-slate-900">🚚 Special Orders &amp; Bin Staging</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Track non-stock parts ordered from WPS, Parts Unlimited, Tucker, or OEMs. Assign holding bins (`Bin SO-1`), track shipments, send 1-tap arrival SMS notifications, and convert directly to invoices.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: OFFLINE MODE */}
      {activeTab === 'offline' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <Card className="p-6 space-y-4 border-l-4 border-l-emerald-500">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-100 text-emerald-800 font-bold">
                📶
              </span>
              <h3 className="text-base font-black text-slate-900">
                100% Offline Capability: How It Works
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Most software breaks when cell signal drops in a steel pole barn or out on a forest service road. Outlaw Shop Systems has an embedded offline database running right on your phone or laptop.
            </p>

            <div className="space-y-3 text-xs text-slate-700 leading-relaxed pt-1">
              <div className="flex items-start gap-2.5">
                <CheckIcon className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  <strong>All Read &amp; Write Operations are Local:</strong> You can create repair orders, look up parts, desk deals, and write invoices with zero internet connection.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <CheckIcon className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Automatic Cloud Sync:</strong> The moment your phone picks up Wi-Fi or LTE, the app automatically syncs all queued changes to your cloud database in the background.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <CheckIcon className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Network Status Indicator:</strong> The header badge displays your live connection status and shows any items queued for synchronization.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 5: HARDWARE & PRINTERS */}
      {activeTab === 'hardware' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <Card className="p-6 space-y-4 border-l-4 border-l-blue-600">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-100 text-blue-800 font-bold">
                🖨️
              </span>
              <h3 className="text-base font-black text-slate-900">
                Hardware, Printers &amp; Truck Mounts
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 text-xs">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <p className="font-bold text-slate-900">📱 Mobile Android APK Printing</p>
                <p className="text-slate-600 leading-relaxed">
                  The Android app connects directly to Android Print Services. Any Wi-Fi, Bluetooth, or Mopria-compatible mobile printer (Brother PocketJet, HP OfficeJet 250, Canon Pixma) prints standard 8.5" x 11" invoices with one tap.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <p className="font-bold text-slate-900">🖥️ Desktop &amp; Dealership Laser Printers</p>
                <p className="text-slate-600 leading-relaxed">
                  Invoices and Buyer's Orders are formatted with clean, compact CSS designed to fit on a single crisp sheet of paper without awkward orphan pages or spilled margins.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 6: DIRECT SUPPORT */}
      {activeTab === 'support' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <Card className="p-6 space-y-4 border-l-4 border-l-slate-900 bg-gradient-to-br from-slate-900 to-slate-950 text-white shadow-xl">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500 text-slate-950 font-black shadow-md shadow-orange-500/20">
                ⚡
              </span>
              <div>
                <h3 className="text-lg font-black text-white">Direct Founder &amp; Tech Support</h3>
                <p className="text-xs text-orange-400 font-semibold">
                  Built by a mechanic with 17 years in the bays.
                </p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Have a feature request, need help migrating your dealership data from an older DMS, or found something you'd like adjusted? You have direct access to support.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">Direct Email</p>
                <p className="font-bold text-white text-sm">service@outlawshopsystems.com</p>
                <p className="text-[11px] text-slate-400">Fast response from real shop techs.</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">System Information</p>
                <p className="font-bold text-white text-sm">Outlaw Shop Systems v0.1.0</p>
                <p className="text-[11px] text-slate-400">
                  {settings.enable_dealership_mode ? '🏢 Dealership DMS Edition' : '🚛 Solo Rig Edition'}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
