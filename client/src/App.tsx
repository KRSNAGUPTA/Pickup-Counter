import { useEffect, useRef, useState } from 'react';
import { useCartStore } from './store';
import { PlaceOrderSchema } from './schema';
import MockUpiModal from './components/MockUpiModal';

type Product = { id: string; name: string; pricePaise: number; availableUnits: number };
type OrderStatus = 'pending' | 'paid' | 'picked_up' | 'expired' | 'needs_review';
type Order = { id: string; status: OrderStatus; totalPaise: number };

const rupee = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

export default function App() {
  const { cart, add, dec, clear } = useCartStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUpi, setShowUpi] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const deadlineRef = useRef<number | null>(null);

  const loadProducts = async () => {
    try {
      const res = await fetch('/api/products');
      setProducts(await res.json());
    } catch {
      setError('Could not load products');
    }
  };

  useEffect(() => { loadProducts(); }, []);

  const cartTotalPaise = Object.entries(cart).reduce((sum, [productId, quantity]) => {
    const product = products.find((p) => p.id === productId);
    return sum + (product ? product.pricePaise * quantity : 0);
  }, 0);

  const placeOrder = async () => {
    setError(null);
    setNotice(null);

    const parsed = PlaceOrderSchema.safeParse({
      items: Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity })),
    });
    if (!parsed.success) { setError('Invalid cart'); return; }

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    const createdOrder = await res.json();

    if (!res.ok) {
      setError(
        createdOrder.error === 'INSUFFICIENT_STOCK'
          ? 'Some items just sold out.'
          : 'Could not place order.',
      );
      loadProducts();
      return;
    }

    deadlineRef.current = performance.now() + createdOrder.expiresInSeconds * 1000;
    setSecondsLeft(createdOrder.expiresInSeconds);
    setOrder({ id: createdOrder.orderId, status: 'pending', totalPaise: createdOrder.totalPaise });
    clear();
  };

  useEffect(() => {
    if (!order || order.status !== 'pending') return;
    const ticker = setInterval(() => {
      if (deadlineRef.current == null) return;
      setSecondsLeft(Math.max(0, Math.floor((deadlineRef.current - performance.now()) / 1000)));
    }, 250);
    return () => clearInterval(ticker);
  }, [order?.id, order?.status]);

  useEffect(() => {
    if (!order || order.status !== 'pending') return;
    const pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${order.id}`);
        if (!res.ok) return;
        const latestOrder = await res.json();
        if (latestOrder.status !== 'pending') {
          setShowUpi(false);
          setOrder({ ...order, status: latestOrder.status });
        } else if (deadlineRef.current != null) {
          deadlineRef.current = performance.now() + latestOrder.expiresInSeconds * 1000;
        }
      } catch (err) {
        console.log(err);
      }
    }, 2000);
    return () => clearInterval(pollTimer);
  }, [order?.id, order?.status]);

  const reset = () => {
    setOrder(null);
    setSecondsLeft(null);
    setError(null);
    setNotice(null);
    setShowUpi(false);
    loadProducts();
  };

  if (order && order.status !== 'pending') {
    const statusMessage: Record<OrderStatus, string> = {
      pending: '',
      paid: 'Paid — collect from locker',
      picked_up: 'Collected',
      expired: 'Expired — please try again',
      needs_review: 'Payment received, pending review',
    };
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 font-sans">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold">{statusMessage[order.status]}</h1>
          <p className="text-gray-500 mt-2 text-sm break-all">Order {order.id}</p>
          <button className="mt-6 px-5 py-2 bg-black text-white rounded-lg" onClick={reset}>
            New order
          </button>
        </div>
      </div>
    );
  }

  if (order && order.status === 'pending') {
    const handlePay = async () => {
      const res = await fetch('/api/payments/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, amountPaise: order.totalPaise }),
      });
      if (!res.ok) throw new Error('simulate failed');
    };

    const handleReject = () => {
      setShowUpi(false);
      setNotice(`Payment cancelled. Order expires in ${secondsLeft ?? 0}s.`);
    };

    return (
      <>
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 font-sans">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
            <h1 className="text-2xl font-bold">Order summary</h1>
            <p className="text-gray-500 mt-1 text-sm break-all">Order {order.id}</p>

            <div className="mt-5 border rounded-lg p-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Amount due</span>
                <span className="font-semibold">{rupee(order.totalPaise)}</span>
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-gray-500">Time left</span>
                <span className="font-semibold">{secondsLeft ?? '—'}s</span>
              </div>
            </div>

            {notice && <p className="text-amber-600 text-sm mt-3">{notice}</p>}

            <button
              className="mt-5 w-full px-4 py-3 bg-black text-white rounded-lg font-medium"
              onClick={() => { setNotice(null); setShowUpi(true); }}
            >
              Proceed to pay {rupee(order.totalPaise)}
            </button>
          </div>
        </div>

        {showUpi && (
          <MockUpiModal
            amountPaise={order.totalPaise}
            orderId={order.id}
            onClose={() => setShowUpi(false)}
            onPay={handlePay}
            onReject={handleReject}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Pickup Counter</h1>
        {error && <p className="text-red-600 mb-4">{error}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {products.map((product) => (
            <div key={product.id} className="bg-white rounded-xl shadow p-4 flex flex-col justify-between">
              <div>
                <h2 className="text-lg font-semibold">{product.name}</h2>
                <p className="text-gray-500 text-sm">
                  {rupee(product.pricePaise)} · {product.availableUnits} left
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    className="w-8 h-8 rounded-full border disabled:opacity-40"
                    disabled={!cart[product.id]}
                    onClick={() => dec(product.id)}
                  >
                    -
                  </button>
                  <span className="w-6 text-center">{cart[product.id] ?? 0}</span>
                  <button
                    className="w-8 h-8 rounded-full border disabled:opacity-40"
                    disabled={product.availableUnits === 0}
                    onClick={() => add(product.id, product.availableUnits)}
                  >
                    +
                  </button>
                </div>
                <button
                  className="px-3 py-1.5 bg-black text-white rounded-lg text-sm disabled:opacity-40"
                  disabled={product.availableUnits === 0}
                  onClick={() => add(product.id, product.availableUnits)}
                >
                  Add to cart
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-white rounded-xl shadow p-4 flex items-center justify-between">
          <span className="font-semibold">Total: {rupee(cartTotalPaise)}</span>
          <button
            className="px-5 py-2.5 bg-black text-white rounded-lg font-medium disabled:opacity-40"
            disabled={cartTotalPaise === 0}
            onClick={placeOrder}
          >
            Place order
          </button>
        </div>
      </div>
    </div>
  );
}