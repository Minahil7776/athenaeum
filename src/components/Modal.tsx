import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({
  title,
  onClose,
  children,
  size = 'max-w-md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'max-w-md' | 'max-w-2xl';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/40 flex items-center justify-center p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`w-full ${size} bg-[#FBF9F5] border border-stone-200 rounded-2xl shadow-xl overflow-hidden`}>
        <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-stone-200">
          <h3 className="font-serif font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-900" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export const inputCls =
  'w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-stone-500';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-stone-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
