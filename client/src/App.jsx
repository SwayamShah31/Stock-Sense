import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from './services/api';

const socketBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');

const initialAuth = {
  name: '',
  username: '',
  identifier: '',
  email: '',
  password: '',
  shopName: 'Main Store',
};

const initialProduct = {
  name: '',
  category: 'General',
  description: '',
  imageUrl: '',
  quantity: 0,
  minQuantity: 0,
  costPrice: 0,
  salePrice: 0,
  supplierName: '',
};

const initialSupplier = {
  name: '',
  phone: '',
  email: '',
  category: '',
  supplyRating: 5,
};

const productFieldLabels = {
  name: 'Product name',
  category: 'Category',
  description: 'Product description',
  imageUrl: 'Product image',
  supplierName: 'Supplier name',
  quantity: 'Units in stock',
  minQuantity: 'Reorder threshold',
  costPrice: 'Cost per unit',
  salePrice: 'Selling price per unit',
};

const productImageFallback =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs><rect width="640" height="640" rx="72" fill="url(#g)"/><rect x="90" y="90" width="460" height="460" rx="48" fill="#020617" stroke="#334155" stroke-width="10"/><circle cx="245" cy="250" r="44" fill="#38bdf8" opacity="0.95"/><path d="M175 440l95-125 80 105 50-58 95 78H175z" fill="#38bdf8" opacity="0.85"/><text x="320" y="540" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="#94a3b8">No image</text></svg>'
  );

const panelStorageKey = 'stocksense_panel_mode';

const authStorageKeys = {
  admin: {
    token: 'stocksense_token_admin',
    user: 'stocksense_user_admin',
  },
  customer: {
    token: 'stocksense_token_customer',
    user: 'stocksense_user_customer',
  },
};

const authRoutes = {
  login: {
    admin: '/login/admin',
    customer: '/login/customer',
  },
  register: {
    admin: '/register/admin',
    customer: '/register/customer',
  },
};

const adminTabRoutes = {
  overview: '/dashboard/summary',
  inventory: '/dashboard/inventory',
  prediction: '/dashboard/forecast',
  suppliers: '/dashboard/suppliers',
};

const customerTabRoutes = {
  store: '/catalog',
  cart: '/cart',
  orders: '/my-orders',
};

function getAuthStateFromPath(pathname) {
  if (pathname.startsWith('/register/')) {
    return {
      mode: 'register',
      panelMode: pathname.endsWith('/customer') ? 'customer' : 'admin',
    };
  }

  if (pathname.startsWith('/login/')) {
    return {
      mode: 'login',
      panelMode: pathname.endsWith('/customer') ? 'customer' : 'admin',
    };
  }

  return null;
}

function getAdminTabFromPath(pathname) {
  if (pathname === adminTabRoutes.inventory) {
    return 'inventory';
  }

  if (pathname === adminTabRoutes.prediction) {
    return 'prediction';
  }

  if (pathname === adminTabRoutes.suppliers) {
    return 'suppliers';
  }

  return 'overview';
}

function getCustomerTabFromPath(pathname) {
  if (pathname === customerTabRoutes.cart) {
    return 'cart';
  }

  if (pathname === customerTabRoutes.orders) {
    return 'orders';
  }

  return 'store';
}

function getStoredPanelMode() {
  if (typeof window === 'undefined') {
    return 'admin';
  }

  return sessionStorage.getItem(panelStorageKey) === 'customer' ? 'customer' : 'admin';
}

function getStoredSession(role) {
  const storageKeys = authStorageKeys[role];
  const storedToken = sessionStorage.getItem(storageKeys.token) || '';
  const storedUser = sessionStorage.getItem(storageKeys.user);

  return {
    token: storedToken,
    user: storedUser ? JSON.parse(storedUser) : null,
  };
}

function getProductImageSrc(product) {
  return product.imageUrl || productImageFallback;
}

const maxProductImageSizeBytes = 2 * 1024 * 1024;

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read image file'));
    reader.readAsDataURL(file);
  });
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-glow backdrop-blur-xl">
      <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <p className="mt-2 text-sm text-slate-400">{hint}</p>
    </div>
  );
}

function SectionShell({ title, subtitle, children, action }) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 shadow-glow backdrop-blur-xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function getStockStatus(product) {
  const quantity = Number(product.quantity || 0);
  const minQuantity = Number(product.minQuantity || 0);

  if (quantity <= 0) {
    return {
      label: 'Out of stock',
      className: 'border-rose-500/30 bg-rose-500/15 text-rose-100',
    };
  }

  if (quantity <= minQuantity) {
    return {
      label: 'Low stock',
      className: 'border-amber-500/30 bg-amber-500/15 text-amber-100',
    };
  }

  return {
    label: 'Healthy',
    className: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-100',
  };
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [panelMode, setPanelMode] = useState(() => getStoredPanelMode());
  const [authForm, setAuthForm] = useState(initialAuth);
  const [authSuggestions, setAuthSuggestions] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [productForm, setProductForm] = useState(initialProduct);
  const [editingProductId, setEditingProductId] = useState('');
  const [supplierForm, setSupplierForm] = useState(initialSupplier);
  const [historyInput, setHistoryInput] = useState('12, 15, 18, 17, 21, 24');
  const initialSession = getStoredSession(getStoredPanelMode());
  const [token, setToken] = useState(initialSession.token);
  const [user, setUser] = useState(initialSession.user);
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [customerTab, setCustomerTab] = useState('store');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerCategory, setCustomerCategory] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [customerQuantities, setCustomerQuantities] = useState({});
  const [customerCart, setCustomerCart] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const totalValue = useMemo(
    () => products.reduce((sum, product) => sum + Number(product.salePrice || 0) * Number(product.quantity || 0), 0),
    [products],
  );
  const lowStockProducts = useMemo(
    () => products.filter((product) => Number(product.quantity || 0) > 0 && Number(product.quantity || 0) <= Number(product.minQuantity || 0)),
    [products],
  );
  const outOfStockProducts = useMemo(
    () => products.filter((product) => Number(product.quantity || 0) <= 0),
    [products],
  );
  const isCustomerAccount = user?.role === 'customer';
  const customerCategories = useMemo(
    () => ['All', ...new Set(products.map((product) => product.category || 'General'))],
    [products],
  );
  const filteredCustomerProducts = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory = customerCategory === 'All' || (product.category || 'General') === customerCategory;
      const matchesQuery = !query || [product.name, product.description, product.category, product.supplierName]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));

      return matchesCategory && matchesQuery;
    });
  }, [customerCategory, customerSearch, products]);
  const customerCartItems = useMemo(
    () => Object.entries(customerCart)
      .map(([productId, quantity]) => {
        const product = products.find((item) => item._id === productId);
        return product ? { ...product, quantityInCart: quantity } : null;
      })
      .filter(Boolean),
    [customerCart, products],
  );
  const customerCartTotal = useMemo(
    () => customerCartItems.reduce((sum, item) => sum + Number(item.salePrice || 0) * Number(item.quantityInCart || 0), 0),
    [customerCartItems],
  );

  useEffect(() => {
    const authState = getAuthStateFromPath(location.pathname);

    if (!token) {
      if (authState) {
        if (mode !== authState.mode) {
          setMode(authState.mode);
        }

        if (panelMode !== authState.panelMode) {
          setPanelMode(authState.panelMode);
        }
      } else {
        navigate(authRoutes.login[panelMode], { replace: true });
      }

      return;
    }

    if (user?.role === 'customer') {
      const nextTab = getCustomerTabFromPath(location.pathname);
      if (customerTab !== nextTab) {
        setCustomerTab(nextTab);
      }

      const nextPath = customerTabRoutes[nextTab];
      if (location.pathname !== nextPath) {
        navigate(nextPath, { replace: true });
      }
      return;
    }

    const nextTab = getAdminTabFromPath(location.pathname);
    if (activeTab !== nextTab) {
      setActiveTab(nextTab);
    }

    const nextPath = adminTabRoutes[nextTab];
    if (location.pathname !== nextPath) {
      navigate(nextPath, { replace: true });
    }
  }, [activeTab, customerTab, location.pathname, mode, navigate, panelMode, token, user?.role]);

  useEffect(() => {
    let socket;

    if (token) {
      const connect = async () => {
        try {
          await refreshDashboard();
        } catch (requestError) {
          setError(requestError?.response?.data?.message || 'Could not load dashboard data');
        }
      };

      connect();
      socket = io(socketBaseUrl, { transports: ['websocket'] });
      socket.on('notification:new', (incoming) => {
        setNotifications((current) => [{ ...incoming, _id: Date.now().toString() }, ...current]);
        refreshDashboard().catch(() => {});
      });
      socket.on('database:change', () => {
        refreshDashboard().catch(() => {});
      });
    }

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [token]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const endpoint = mode === 'register' ? '/auth/register' : '/auth/login';
      const payload = mode === 'register'
        ? {
          name: authForm.name,
          username: authForm.username,
          email: authForm.email,
          password: authForm.password,
          role: panelMode === 'customer' ? 'customer' : 'owner',
          ...(panelMode === 'admin' ? { shopName: authForm.shopName } : {}),
        }
        : { identifier: authForm.identifier, password: authForm.password };
      const response = await api.post(endpoint, payload);

      const isCustomerLogin = panelMode === 'customer';
      const detectedRole = response.data.user.role === 'customer' ? 'Customer' : 'Admin';
      const isCustomerAccount = detectedRole === 'Customer';

      if ((isCustomerLogin && !isCustomerAccount) || (!isCustomerLogin && isCustomerAccount)) {
        throw new Error(`This is a ${detectedRole} account. Switch to ${detectedRole} sign-in.`);
      }

      const storageKeys = authStorageKeys[panelMode];
      sessionStorage.setItem(storageKeys.token, response.data.token);
      sessionStorage.setItem(storageKeys.user, JSON.stringify(response.data.user));
      sessionStorage.setItem(panelStorageKey, panelMode);
      setToken(response.data.token);
      setUser(response.data.user);
      setAuthSuggestions(null);
      navigate(response.data.user.role === 'customer' ? customerTabRoutes.store : adminTabRoutes.overview, { replace: true });
      setMessage(`Welcome back, ${response.data.user.name}.`);
    } catch (requestError) {
      setAuthSuggestions(requestError?.response?.data?.suggestions || null);
      setError(requestError?.response?.data?.message || requestError?.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  }

  async function refreshDashboard() {
    if (user?.role === 'customer') {
      const [productsResponse, ordersResponse] = await Promise.all([api.get('/products'), api.get('/orders')]);
      setProducts(productsResponse.data.products || []);
      setCustomerOrders(ordersResponse.data.orders || []);
      setSummary(null);
      setNotifications([]);
      setSuppliers([]);
      return;
    }

    const [summaryResponse, productsResponse, notificationsResponse, suppliersResponse] = await Promise.all([
      api.get('/dashboard/summary'),
      api.get('/products'),
      api.get('/notifications'),
      api.get('/suppliers'),
    ]);

    setSummary(summaryResponse.data.summary);
    setProducts(productsResponse.data.products || []);
    setNotifications(notificationsResponse.data.notifications || []);
    setSuppliers(suppliersResponse.data.suppliers || []);
  }

  async function handleProductSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const wasEditing = Boolean(editingProductId);

    try {
      if (wasEditing) {
        await api.patch(`/products/${editingProductId}`, productForm);
      } else {
        await api.post('/products', productForm);
      }
      setProductForm(initialProduct);
      setEditingProductId('');
      await refreshDashboard();
      setMessage(wasEditing ? 'Product updated successfully.' : 'Product saved successfully.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Could not save product');
    } finally {
      setBusy(false);
    }
  }

  function startEditingProduct(product) {
    setEditingProductId(product._id);
    setProductForm({
      name: product.name || '',
      category: product.category || 'General',
      description: product.description || '',
      imageUrl: product.imageUrl || '',
      quantity: Number(product.quantity ?? 0),
      minQuantity: Number(product.minQuantity ?? 0),
      costPrice: Number(product.costPrice ?? 0),
      salePrice: Number(product.salePrice ?? 0),
      supplierName: product.supplierName || '',
    });
    setActiveTab('inventory');
    navigate(adminTabRoutes.inventory);
    setMessage(`Editing ${product.name}.`);
    setError('');
  }

  async function handleProductImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > maxProductImageSizeBytes) {
      setError('Please choose an image smaller than 2 MB');
      event.target.value = '';
      return;
    }

    try {
      const imageData = await readImageFile(file);
      setProductForm((current) => ({ ...current, imageUrl: String(imageData) }));
      setError('');
    } catch {
      setError('Could not load that image file');
    }
  }

  function cancelEditingProduct() {
    setEditingProductId('');
    setProductForm(initialProduct);
    setMessage('');
    setError('');
  }

  async function handleSupplierSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      await api.post('/suppliers', supplierForm);
      setSupplierForm(initialSupplier);
      await refreshDashboard();
      setMessage('Supplier added successfully.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Could not save supplier');
    } finally {
      setBusy(false);
    }
  }

  async function handlePredictionSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const history = historyInput
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value));

      const response = await api.post('/ai/predict-sales', { history, daysAhead: 7 });
      setPrediction(response.data);
      setMessage('Prediction generated.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Could not generate prediction');
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    Object.values(authStorageKeys).forEach((storageKeys) => {
      sessionStorage.removeItem(storageKeys.token);
      sessionStorage.removeItem(storageKeys.user);
    });
    sessionStorage.removeItem(panelStorageKey);
    setToken('');
    setUser(null);
    setAuthForm(initialAuth);
    setShowPassword(false);
    setMode('login');
    setSummary(null);
    setProducts([]);
    setSuppliers([]);
    setNotifications([]);
    setPrediction(null);
    setCustomerOrders([]);
    setCustomerQuantities({});
    setAuthSuggestions(null);
    navigate(authRoutes.login[panelMode], { replace: true });
    setMessage('');
    setError('');
  }

  function handleModeChange(nextMode) {
    setMode(nextMode);
    setAuthSuggestions(null);
    setMessage('');
    setError('');
    setShowPassword(false);
    navigate(authRoutes[nextMode][panelMode], { replace: true });
  }

  function handlePanelChange(nextPanel) {
    setPanelMode(nextPanel);
    sessionStorage.setItem(panelStorageKey, nextPanel);
    const nextSession = getStoredSession(nextPanel);
    setToken(nextSession.token);
    setUser(nextSession.user);
    setAuthSuggestions(null);
    setMessage('');
    setError('');
    setShowPassword(false);
    navigate(authRoutes[mode][nextPanel], { replace: true });
  }

  function addToCustomerCart(product) {
    const quantity = Math.max(1, Number(customerQuantities[product._id] || 1));
    const availableQuantity = Number(product.quantity || 0);

    if (availableQuantity <= 0) {
      setError(`${product.name} is out of stock`);
      return;
    }

    setCustomerCart((current) => ({
      ...current,
      [product._id]: Math.min(availableQuantity, (current[product._id] || 0) + quantity),
    }));
    setCustomerTab('cart');
    navigate(customerTabRoutes.cart);
    setSelectedProduct(null);
    setMessage(`${product.name} added to cart.`);
  }

  function updateCustomerCartQuantity(productId, quantity) {
    const normalizedQuantity = Math.max(1, Number(quantity || 1));
    setCustomerCart((current) => ({ ...current, [productId]: normalizedQuantity }));
  }

  function removeCustomerCartItem(productId) {
    setCustomerCart((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }

  async function checkoutCustomerCart() {
    if (!customerCartItems.length) {
      setError('Your cart is empty');
      return;
    }

    setBusy(true);
    setMessage('');
    setError('');

    try {
      await api.post('/orders', {
        items: customerCartItems.map((item) => ({
          productId: item._id,
          quantity: item.quantityInCart,
          price: item.salePrice,
        })),
        paymentStatus: 'pending',
        orderStatus: 'confirmed',
      });
      setCustomerCart({});
      await refreshDashboard();
      setCustomerTab('orders');
      navigate(customerTabRoutes.orders);
      setMessage('Order placed successfully.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Could not complete checkout');
    } finally {
      setBusy(false);
    }
  }

  function openProductDetails(product) {
    setSelectedProduct(product);
  }

  function closeProductDetails() {
    setSelectedProduct(null);
  }

  async function cancelCustomerOrder(orderId) {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      await api.patch(`/orders/${orderId}/cancel`);
      await refreshDashboard();
      setMessage('Order cancelled and stock restored.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Could not cancel order');
    } finally {
      setBusy(false);
    }
  }

  async function handleCustomerOrder(product) {
    const quantity = Number(customerQuantities[product._id] || 1);
    if (!Number.isFinite(quantity) || quantity < 1) {
      setError('Choose a valid quantity');
      return;
    }

    if (Number(product.quantity || 0) <= 0) {
      setError(`${product.name} is out of stock`);
      return;
    }

    if (quantity > Number(product.quantity || 0)) {
      setError(`${product.name} only has ${product.quantity} units available`);
      return;
    }

    setBusy(true);
    setMessage('');
    setError('');

    try {
      await api.post('/orders', {
        items: [{ productId: product._id, quantity, price: product.salePrice }],
        paymentStatus: 'pending',
        orderStatus: 'confirmed',
      });
      await refreshDashboard();
      setCustomerQuantities((current) => ({ ...current, [product._id]: 1 }));
      setCustomerTab('orders');
      setMessage('Order placed successfully.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Could not place order');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <main className="min-h-screen overflow-hidden px-4 py-6 text-slate-100 sm:px-6 lg:px-10">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.22),transparent_24%),radial-gradient(circle_at_top_right,rgba(99,102,241,0.16),transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_55%,#111827_100%)]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:64px_64px] opacity-20" />

        <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="relative overflow-hidden rounded-[2.75rem] border border-white/10 bg-slate-950/55 p-8 shadow-glow backdrop-blur-2xl sm:p-10 lg:p-12">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.28),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.2),transparent_32%)]" />
            <div className="absolute right-8 top-8 h-28 w-28 rounded-full bg-sky-400/20 blur-3xl" />
            <div className="absolute bottom-8 left-8 h-36 w-36 rounded-full bg-indigo-500/20 blur-3xl" />

            <div className="relative z-10 flex h-full flex-col justify-between gap-10">
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.26em] text-sky-200">
                    StockSense AI
                  </span>
                </div>

                <div className="max-w-3xl space-y-5">
                  <h1 className="text-5xl font-semibold leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl">
                    StockSense access for admin and customer accounts.
                  </h1>
                  <p className="max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
                    Choose the account type, sign in, and continue.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="relative rounded-[2.75rem] border border-white/10 bg-white/6 p-6 shadow-glow backdrop-blur-2xl sm:p-8 lg:p-10">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Access portal</p>
                <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
                  {panelMode === 'customer' ? 'Customer access' : 'Admin access'}
                </h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                  {panelMode === 'customer'
                    ? 'Sign in or create a customer account to browse products and prices.'
                    : 'Sign in or create an admin account to manage products and orders.'}
                </p>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-2 rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-2">
              {[
                ['admin', 'Admin'],
                ['customer', 'Customer'],
              ].map(([item, label]) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handlePanelChange(item)}
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    panelMode === item
                      ? 'bg-gradient-to-r from-sky-500 to-blue-500 text-white shadow-lg shadow-sky-500/20'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mb-6 grid grid-cols-2 gap-2 rounded-[1.5rem] border border-white/10 bg-slate-900/70 p-2">
              {['login', 'register'].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleModeChange(item)}
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    mode === item
                      ? 'bg-gradient-to-r from-sky-500 to-blue-500 text-white shadow-lg shadow-sky-500/20'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {item === 'login' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <form className="space-y-4" onSubmit={handleAuthSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                {mode === 'register' && (
                  <label className="space-y-2 sm:col-span-2">
                    <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Full name</span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3.5 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-sky-400"
                      placeholder="John Smith"
                      value={authForm.name}
                      onChange={(event) => setAuthForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>
                )}

                {mode === 'register' && (
                  <label className="space-y-2 sm:col-span-2">
                    <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Username</span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3.5 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-sky-400"
                      placeholder="johnsmith_24"
                      autoComplete="username"
                      value={authForm.username}
                      onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))}
                    />
                    <p className="text-[11px] text-slate-500">Unique login name. Suggestions appear if it is already taken.</p>
                  </label>
                )}

                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{mode === 'login' ? 'Username or email' : 'Email address'}</span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3.5 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-sky-400"
                    placeholder={mode === 'login' ? 'yourname or you@example.com' : 'you@example.com'}
                    type={mode === 'login' ? 'text' : 'email'}
                    autoComplete={mode === 'login' ? 'username' : 'email'}
                    value={mode === 'login' ? authForm.identifier : authForm.email}
                    onChange={(event) => setAuthForm((current) => (
                      mode === 'login'
                        ? { ...current, identifier: event.target.value }
                        : { ...current, email: event.target.value }
                    ))}
                  />
                </label>

                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Password</span>
                  <div className="relative">
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3.5 pr-20 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-sky-400"
                      placeholder="Enter your password"
                      type={showPassword ? 'text' : 'password'}
                      value={authForm.password}
                      onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                {mode === 'register' && panelMode === 'admin' && (
                  <label className="space-y-2 sm:col-span-2">
                    <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Shop name</span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3.5 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-sky-400"
                      placeholder="Main Store"
                      value={authForm.shopName}
                      onChange={(event) => setAuthForm((current) => ({ ...current, shopName: event.target.value }))}
                    />
                  </label>
                )}

              </div>

              <div className="flex items-center justify-between gap-3 text-sm text-slate-400">
                <span>{panelMode === 'customer' ? 'Customer login' : 'Admin login'}</span>
                <span className="text-slate-500">{mode === 'login' ? 'Username or email and password' : 'Unique username, email, and password'}</span>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-2xl bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? 'Working...' : mode === 'login' ? `Sign in as ${panelMode === 'customer' ? 'Customer' : 'Admin'}` : 'Create account'}
              </button>
            </form>

            {(message || error) && (
              <div className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${error ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
                {error || message}
                {authSuggestions && (authSuggestions.usernames?.length || authSuggestions.emails?.length) ? (
                  <div className="mt-4 space-y-3 text-slate-100">
                    {authSuggestions.usernames?.length ? (
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Available usernames</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {authSuggestions.usernames.map((suggestion) => (
                            <span key={suggestion} className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-xs text-slate-100">
                              {suggestion}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {authSuggestions.emails?.length ? (
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Available emails</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {authSuggestions.emails.map((suggestion) => (
                            <span key={suggestion} className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-xs text-slate-100">
                              {suggestion}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  if (isCustomerAccount) {
    return (
      <main className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <header className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-5 shadow-glow backdrop-blur-xl sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-3xl font-semibold text-white">StockSense Store</h1>
                <p className="mt-2 text-sm text-slate-400">Browse products, images, descriptions, and prices.</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-2xl bg-rose-500/15 px-4 py-2 text-sm text-rose-200 hover:bg-rose-500/25"
              >
                Sign out
              </button>
            </div>
          </header>

          <div className="grid gap-3 sm:grid-cols-2">
            {['store', 'orders'].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setCustomerTab(item);
                  navigate(customerTabRoutes[item]);
                }}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  customerTab === item
                    ? 'border-sky-400/30 bg-sky-400/10 text-sky-100'
                    : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                {item === 'store' ? 'Catalog' : 'My orders'}
              </button>
            ))}
          </div>

          {selectedProduct && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
              <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-[2rem] border border-white/10 bg-slate-950 shadow-glow">
                <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
                  <img src={getProductImageSrc(selectedProduct)} alt={selectedProduct.name} className="h-72 w-full object-cover lg:h-full" />
                  <div className="p-6 sm:p-8">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-3xl font-semibold text-white">{selectedProduct.name}</h3>
                        <p className="mt-2 text-sm text-slate-400">{selectedProduct.category}</p>
                      </div>
                      <button
                        type="button"
                        onClick={closeProductDetails}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10"
                      >
                        Close
                      </button>
                    </div>
                    <p className="mt-5 text-base leading-8 text-slate-300">{selectedProduct.description || 'No description available.'}</p>
                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Price</p>
                        <p className="mt-1 text-2xl font-semibold text-white">${Number(selectedProduct.salePrice || 0).toFixed(2)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Available</p>
                        <p className="mt-1 text-2xl font-semibold text-white">{selectedProduct.quantity}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Status</p>
                        <p className="mt-1 text-2xl font-semibold text-white">{getStockStatus(selectedProduct).label}</p>
                      </div>
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={busy || Number(selectedProduct.quantity || 0) <= 0}
                        onClick={() => {
                          addToCustomerCart(selectedProduct);
                          closeProductDetails();
                          setCustomerTab('cart');
                        }}
                        className="rounded-2xl bg-brand-500 px-5 py-3 font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {Number(selectedProduct.quantity || 0) <= 0 ? 'Out of stock' : 'Add to cart'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {customerTab === 'store' && (
            <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 shadow-glow backdrop-blur-xl sm:p-8">
              <div className="mb-6 max-w-3xl space-y-4">
                <h2 className="text-4xl font-semibold text-white sm:text-5xl">Catalog</h2>
                <p className="text-base leading-7 text-slate-300 sm:text-lg">
                  Product images and descriptions are front and center, with selling price shown clearly for each item.
                </p>
              </div>

              <div className="mb-6 grid gap-3 lg:grid-cols-[1.4fr_0.8fr]">
                <label className="grid gap-1.5 text-sm text-slate-300">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Search products</span>
                  <input
                    className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-brand-400"
                    placeholder="Search by name, description, category, supplier"
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                  />
                </label>
                <label className="grid gap-1.5 text-sm text-slate-300">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Category</span>
                  <select
                    className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-brand-400"
                    value={customerCategory}
                    onChange={(event) => setCustomerCategory(event.target.value)}
                  >
                    {customerCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {filteredCustomerProducts.map((product) => (
                  <article key={product._id} className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5">
                    <button type="button" onClick={() => openProductDetails(product)} className="block w-full text-left">
                      <img src={getProductImageSrc(product)} alt={product.name} className="h-72 w-full object-cover" />
                    </button>
                    <div className="space-y-4 p-5">
                      <button type="button" onClick={() => openProductDetails(product)} className="text-left">
                        <h3 className="text-2xl font-semibold text-white">{product.name}</h3>
                      </button>
                      <p className="text-sm leading-7 text-slate-300">{product.description || 'No description available.'}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                        <span className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1">{product.category}</span>
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-emerald-100">
                          ${Number(product.salePrice || 0).toFixed(2)}
                        </span>
                        <span className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1">{product.quantity} available</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                        <label className="grid gap-1.5 text-xs text-slate-400">
                          <span className="uppercase tracking-[0.2em]">Qty</span>
                          <input
                            type="number"
                            min="1"
                            className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-brand-400"
                            value={customerQuantities[product._id] || 1}
                            onChange={(event) => setCustomerQuantities((current) => ({ ...current, [product._id]: Number(event.target.value) }))}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={busy || Number(product.quantity || 0) <= 0}
                          onClick={() => addToCustomerCart(product)}
                          className="mt-auto rounded-2xl bg-brand-500 px-4 py-3 font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {Number(product.quantity || 0) <= 0 ? 'Out of stock' : 'Add to cart'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {!filteredCustomerProducts.length && <p className="text-sm text-slate-500">No products matched your search.</p>}
              </div>
            </section>
          )}

          {customerTab === 'cart' && (
            <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 shadow-glow backdrop-blur-xl sm:p-8">
              <div className="mb-6 max-w-3xl space-y-4">
                <h2 className="text-4xl font-semibold text-white sm:text-5xl">Your cart</h2>
                <p className="text-base leading-7 text-slate-300 sm:text-lg">Review items before checking out.</p>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
                <div className="grid gap-4">
                  {customerCartItems.map((item) => (
                    <article key={item._id} className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 sm:grid-cols-[120px_1fr]">
                      <img src={getProductImageSrc(item)} alt={item.name} className="h-32 w-full rounded-2xl object-cover" />
                      <div className="flex flex-col justify-between gap-4">
                        <div>
                          <h3 className="text-xl font-semibold text-white">{item.name}</h3>
                          <p className="mt-1 text-sm text-slate-400">${Number(item.salePrice || 0).toFixed(2)} each</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="grid gap-1.5 text-xs text-slate-400">
                            <span className="uppercase tracking-[0.2em]">Qty</span>
                            <input
                              type="number"
                              min="1"
                              max={item.quantity}
                              className="w-24 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-brand-400"
                              value={item.quantityInCart}
                              onChange={(event) => updateCustomerCartQuantity(item._id, event.target.value)}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => removeCustomerCartItem(item._id)}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {!customerCartItems.length && <p className="text-sm text-slate-500">Your cart is empty.</p>}
                </div>

                <aside className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                  <h3 className="text-xl font-semibold text-white">Order summary</h3>
                  <div className="mt-4 space-y-3 text-sm text-slate-300">
                    <div className="flex items-center justify-between">
                      <span>Items</span>
                      <span>{customerCartItems.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Total</span>
                      <span className="text-lg font-semibold text-white">${customerCartTotal.toFixed(2)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || !customerCartItems.length}
                    onClick={checkoutCustomerCart}
                    className="mt-5 w-full rounded-2xl bg-brand-500 px-4 py-3 font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Checkout
                  </button>
                </aside>
              </div>
            </section>
          )}

          {customerTab === 'orders' && (
            <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 shadow-glow backdrop-blur-xl sm:p-8">
              <div className="mb-6 max-w-3xl space-y-4">
                <h2 className="text-4xl font-semibold text-white sm:text-5xl">My orders</h2>
                <p className="text-base leading-7 text-slate-300 sm:text-lg">
                  See the items you already bought and their status.
                </p>
              </div>

              <div className="grid gap-4">
                {customerOrders.map((order) => (
                  <article key={order._id} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-semibold text-white">Order {order._id.slice(-6)}</h3>
                        <p className="mt-1 text-sm text-slate-400">{new Date(order.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${order.orderStatus === 'cancelled' ? 'border-rose-500/30 bg-rose-500/15 text-rose-100' : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-100'}`}>
                          {order.orderStatus}
                        </span>
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-100">
                          ${Number(order.totalAmount || 0).toFixed(2)}
                        </span>
                        {order.orderStatus !== 'cancelled' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => cancelCustomerOrder(order._id)}
                            className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Cancel order
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {order.items?.map((item) => (
                        <div key={`${order._id}-${item.product}`} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                          <p className="font-medium text-white">{item.name}</p>
                          <p className="mt-1 text-sm text-slate-400">Qty {item.quantity}</p>
                          <p className="mt-1 text-sm text-slate-400">${Number(item.price || 0).toFixed(2)} each</p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
                {!customerOrders.length && <p className="text-sm text-slate-500">No orders yet.</p>}
              </div>
            </section>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-5 shadow-glow backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold text-white">StockSense AI</h1>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                  Connected
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {user?.shopName || 'Store'} dashboard, live notifications, and local-AI forecasting.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('overview');
                  navigate(adminTabRoutes.overview);
                }}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
              >
                Summary
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('inventory');
                  navigate(adminTabRoutes.inventory);
                }}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
              >
                Inventory
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('prediction');
                  navigate(adminTabRoutes.prediction);
                }}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
              >
                Forecast
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('suppliers');
                  navigate(adminTabRoutes.suppliers);
                }}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
              >
                Suppliers
              </button>
              <button
                type="button"
                onClick={logout}
                className="rounded-2xl bg-rose-500/15 px-4 py-2 text-sm text-rose-200 hover:bg-rose-500/25"
              >
                Sign out
              </button>
            </div>
          </div>
          {(message || error) && (
            <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${error ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
              {error || message}
            </div>
          )}
        </header>

        {(location.pathname === adminTabRoutes.overview || location.pathname === '/dashboard' || location.pathname === '/') && (
          <div className="grid gap-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Products" value={summary?.productsCount ?? products.length} hint="Total active stock items" />
              <MetricCard label="Orders" value={summary?.ordersCount ?? 0} hint="Completed and pending orders" />
              <MetricCard label="Revenue" value={`$${Number(summary?.revenue || 0).toFixed(2)}`} hint="Recent transaction total" />
              <MetricCard label="Low stock" value={summary?.lowStockProducts ?? 0} hint="Items at or below the reorder threshold" />
            </div>

            <SectionShell title="Alerts" subtitle="Live notifications arrive instantly.">
              <div className="grid gap-3">
                {notifications.slice(0, 5).map((item) => (
                  <div key={item._id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-400">{item.message}</p>
                  </div>
                ))}
                {!notifications.length && <p className="text-sm text-slate-500">No notifications yet.</p>}
              </div>
            </SectionShell>

            <SectionShell
              title="Inventory snapshot"
              subtitle="Your latest catalog is loaded from MongoDB and updated through the API."
              action={<div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">Value: ${totalValue.toFixed(2)}</div>}
            >
              <div className="grid gap-3">
                {products.slice(0, 4).map((product) => (
                  <div key={product._id} className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-5">
                    <img
                      src={getProductImageSrc(product)}
                      alt={product.name}
                      className="h-52 w-full rounded-3xl border border-white/10 object-contain bg-slate-950/30 lg:h-full lg:min-h-[220px]"
                    />
                    <div className="flex min-w-0 flex-col gap-5">
                      <div className="space-y-3">
                        <div>
                          <p className="text-2xl font-semibold text-white">{product.name}</p>
                          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300">{product.description || 'No description added yet.'}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                          <span className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1">{product.category}</span>
                          <span className={`rounded-full border px-3 py-1 font-medium ${getStockStatus(product).className}`}>
                            {getStockStatus(product).label}
                          </span>
                          <span className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1">{product.quantity} in stock</span>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-4">
                          <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">Units in stock</span>
                          <span className="mt-2 block text-base font-semibold text-white">{product.quantity}</span>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-4">
                          <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">Reorder threshold</span>
                          <span className="mt-2 block text-base font-semibold text-white">{product.minQuantity}</span>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-4">
                          <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">Cost per unit</span>
                          <span className="mt-2 block text-base font-semibold text-white">${Number(product.costPrice || 0).toFixed(2)}</span>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-4">
                          <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">Selling price per unit</span>
                          <span className="mt-2 block text-base font-semibold text-white">${Number(product.salePrice || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {!products.length && (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-8 text-center text-sm text-slate-400">
                    Add a product in the Inventory tab to populate this view.
                  </div>
                )}
              </div>
            </SectionShell>
          </div>
        )}

        {location.pathname === adminTabRoutes.inventory && (
          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <SectionShell title={editingProductId ? 'Edit product' : 'Add product'} subtitle="Create inventory records and keep stock levels in sync.">
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleProductSubmit}>
                {[
                  ['name', 'Product name'],
                  ['category', 'Category'],
                  ['supplierName', 'Supplier name'],
                ].map(([field, label]) => (
                  <label key={field} className="grid gap-1.5 text-sm text-slate-300">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-brand-400"
                      placeholder={label}
                      value={productForm[field]}
                      onChange={(event) => setProductForm((current) => ({ ...current, [field]: event.target.value }))}
                    />
                  </label>
                ))}
                <label className="grid gap-1.5 text-sm text-slate-300 sm:col-span-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Product description</span>
                  <textarea
                    className="min-h-32 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-brand-400"
                    placeholder="Product description"
                    required
                    value={productForm.description}
                    onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))}
                  />
                </label>
                {[
                  ['quantity', 'Units in stock'],
                  ['minQuantity', 'Reorder threshold'],
                  ['costPrice', 'Cost per unit'],
                  ['salePrice', 'Selling price per unit'],
                ].map(([field, label]) => (
                  <label key={field} className="grid gap-1.5 text-sm text-slate-300">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
                    <input
                      className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-brand-400"
                      placeholder={label}
                      type="number"
                      value={productForm[field]}
                      onChange={(event) => setProductForm((current) => ({ ...current, [field]: Number(event.target.value) }))}
                    />
                  </label>
                ))}
                <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Product image</p>
                    <label className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10">
                      Upload image
                      <input
                        accept="image/*"
                        className="sr-only"
                        type="file"
                        onChange={handleProductImageChange}
                      />
                    </label>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr] lg:items-stretch">
                    <img
                      src={getProductImageSrc(productForm)}
                      alt={productForm.name ? `${productForm.name} preview` : 'Product preview'}
                      className="h-80 w-full rounded-3xl border border-white/10 object-cover"
                    />
                    <div className="flex flex-col justify-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-slate-400">
                      <p className="font-medium text-white">Image is required before saving.</p>
                      <p className="mt-1">Upload an image from your device. The preview updates here before you save it.</p>
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="sm:col-span-2 rounded-2xl bg-brand-500 px-4 py-3 font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {editingProductId ? 'Update product' : 'Save product'}
                </button>
                {editingProductId && (
                  <button
                    type="button"
                    onClick={cancelEditingProduct}
                    className="sm:col-span-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-semibold text-slate-100 transition hover:bg-white/10"
                  >
                    Cancel edit
                  </button>
                )}
              </form>
            </SectionShell>

            <SectionShell title="Live stock alerts" subtitle="These update instantly when an order or product save pushes stock under the threshold.">
              <div className="grid gap-3">
                {outOfStockProducts.slice(0, 3).map((product) => (
                  <div key={`out-${product._id}`} className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-rose-100">
                    <p className="font-semibold">{product.name}</p>
                    <p className="mt-1 text-sm text-rose-100/80">Units in stock: 0 | Reorder threshold: {product.minQuantity}</p>
                    <p className="mt-1 text-sm text-rose-100/80">Out of stock. Restock immediately.</p>
                  </div>
                ))}
                {lowStockProducts.slice(0, 3).map((product) => (
                  <div key={`low-${product._id}`} className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-amber-50">
                    <p className="font-semibold">{product.name}</p>
                    <p className="mt-1 text-sm text-amber-50/80">Units in stock: {product.quantity} | Reorder threshold: {product.minQuantity}</p>
                    <p className="mt-1 text-sm text-amber-50/80">Only {product.quantity} units left. Reorder soon.</p>
                  </div>
                ))}
                {!lowStockProducts.length && !outOfStockProducts.length && (
                  <p className="text-sm text-slate-500">No low-stock alerts right now.</p>
                )}
              </div>
            </SectionShell>

            <div className="xl:col-span-2">
              <SectionShell title="Current stock" subtitle="Use this list as the foundation for billing, alerts, and forecasting.">
                <div className="grid gap-3">
                  {products.map((product) => (
                    <div key={product._id} className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5 lg:grid-cols-[240px_1fr] lg:gap-5">
                      <img
                        src={getProductImageSrc(product)}
                        alt={product.name}
                        className="h-60 w-full rounded-3xl border border-white/10 object-cover lg:h-full lg:min-h-[260px]"
                      />
                      <div className="flex flex-col justify-between gap-5">
                        <div className="space-y-3">
                          <div>
                            <p className="text-2xl font-semibold text-white">{product.name}</p>
                            <p className="mt-2 text-sm leading-7 text-slate-300">{product.description || 'No description added yet.'}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                            <span className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1">{product.category}</span>
                            <span className={`rounded-full border px-3 py-1 font-medium ${getStockStatus(product).className}`}>
                              {getStockStatus(product).label}
                            </span>
                            <span className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1">{product.quantity} in stock</span>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                            <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">Units in stock</span>
                            <span className="mt-1 block text-sm font-semibold text-white">{product.quantity}</span>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                            <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">Reorder threshold</span>
                            <span className="mt-1 block text-sm font-semibold text-white">{product.minQuantity}</span>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                            <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">Cost per unit</span>
                            <span className="mt-1 block text-sm font-semibold text-white">${Number(product.costPrice || 0).toFixed(2)}</span>
                          </div>
                          <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                            <span className="block text-[10px] uppercase tracking-[0.2em] text-slate-500">Selling price per unit</span>
                            <span className="mt-1 block text-sm font-semibold text-white">${Number(product.salePrice || 0).toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEditingProduct(product)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-100 transition hover:bg-white/10"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!products.length && <p className="text-sm text-slate-500">No products saved yet.</p>}
                </div>
              </SectionShell>
            </div>
          </div>
        )}

        {location.pathname === adminTabRoutes.prediction && (
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <SectionShell title="Sales prediction" subtitle="Uses your sales history to estimate future demand.">
              <form className="space-y-4" onSubmit={handlePredictionSubmit}>
                <textarea
                  className="min-h-36 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-brand-400"
                  value={historyInput}
                  onChange={(event) => setHistoryInput(event.target.value)}
                  placeholder="Comma-separated sales history"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-2xl bg-brand-500 px-4 py-3 font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Generate forecast
                </button>
              </form>
            </SectionShell>

            <SectionShell title="Forecast result" subtitle="Short-term demand projection for the next 7 days.">
              {prediction ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetricCard label="Average" value={prediction.forecast.average} hint="Recent sales baseline" />
                    <MetricCard label="Trend" value={prediction.forecast.trend} hint="Growth per period" />
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm uppercase tracking-[0.18em] text-slate-400">Forecast</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {prediction.forecast.forecast.map((value, index) => (
                        <span key={`${index}-${value}`} className="rounded-full bg-brand-500/15 px-3 py-1 text-sm text-brand-100">
                          Day {index + 1}: {value}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    {prediction.insight}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Run a forecast to see demand and restock guidance.</p>
              )}
            </SectionShell>
          </div>
        )}

        {location.pathname === adminTabRoutes.suppliers && (
          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <SectionShell title="Add supplier" subtitle="Keep supplier records simple for the first release.">
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSupplierSubmit}>
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-brand-400 sm:col-span-2"
                  placeholder="Supplier name"
                  value={supplierForm.name}
                  onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))}
                />
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-brand-400"
                  placeholder="Phone"
                  value={supplierForm.phone}
                  onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))}
                />
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-brand-400"
                  placeholder="Email"
                  type="email"
                  value={supplierForm.email}
                  onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))}
                />
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-brand-400"
                  placeholder="Category"
                  value={supplierForm.category}
                  onChange={(event) => setSupplierForm((current) => ({ ...current, category: event.target.value }))}
                />
                <input
                  className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-brand-400"
                  placeholder="Rating"
                  type="number"
                  min="1"
                  max="5"
                  value={supplierForm.supplyRating}
                  onChange={(event) => setSupplierForm((current) => ({ ...current, supplyRating: Number(event.target.value) }))}
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="sm:col-span-2 rounded-2xl bg-brand-500 px-4 py-3 font-semibold text-white transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save supplier
                </button>
              </form>
            </SectionShell>

            <SectionShell title="Supplier list" subtitle="A lightweight base for purchase planning and restocking.">
              <div className="grid gap-3">
                {suppliers.map((supplier) => (
                  <div key={supplier._id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="font-medium text-white">{supplier.name}</p>
                    <p className="mt-1 text-sm text-slate-400">{supplier.category || 'General'} · Rating {supplier.supplyRating}/5</p>
                  </div>
                ))}
                {!suppliers.length && <p className="text-sm text-slate-500">No suppliers added yet.</p>}
              </div>
            </SectionShell>
          </div>
        )}
      </div>
    </main>
  );
}
