import { useEffect, useState } from 'react';

type Props = {
  amountPaise: number;
  orderId: string;
  onClose: () => void;
  onPay: () => Promise<void>;
  onReject: () => void;
};

const rupee = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

export default function MockUpiModal({ amountPaise, orderId, onClose, onPay, onReject }: Props) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !processing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, processing]);

  const handlePay = async () => {
    setProcessing(true);
    setError(null);
    try {
      await onPay();
    } catch {
      setError('Payment failed. Please try again.');
      setProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      onClick={() => !processing && onClose()}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm text-gray-500">Mock UPI</span>
        </div>
        <h2 className="text-xl font-bold">Pay {rupee(amountPaise)}</h2>
        <p className="text-xs text-gray-500 mt-1 break-all">Order {orderId}</p>

        <div className="mt-4 border rounded-lg p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Paying to</span>
            <span className="font-medium">Pickup Counter</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-500">UPI ID</span>
            <span className="font-mono text-xs">counter@mockbank</span>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

        <div className="mt-5 flex flex-col gap-2">
          <button
            className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-40"
            disabled={processing}
            onClick={handlePay}
          >
            {processing ? 'Processing…' : `Pay ${rupee(amountPaise)}`}
          </button>
          <button
            className="px-4 py-2 border rounded disabled:opacity-40"
            disabled={processing}
            onClick={onReject}
          >
            Reject
          </button>
        </div>

        <p className="text-[11px] text-gray-400 mt-4 text-center">
          Demo bank UI — no real money moves.
        </p>
      </div>
    </div>
  );
}