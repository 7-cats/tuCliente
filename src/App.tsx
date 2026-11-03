import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './data/store';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/merchant/Dashboard';
import { Customers } from './pages/merchant/Customers';
import { CustomerDetail } from './pages/merchant/CustomerDetail';
import { NewPurchase } from './pages/merchant/NewPurchase';
import { Rules } from './pages/merchant/Rules';
import { Rewards } from './pages/merchant/Rewards';
import { Promotions } from './pages/merchant/Promotions';
import { Network } from './pages/merchant/Network';
import { Wallet } from './pages/customer/Wallet';

export function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="venta" element={<NewPurchase />} />
            <Route path="clientes" element={<Customers />} />
            <Route path="clientes/:id" element={<CustomerDetail />} />
            <Route path="reglas" element={<Rules />} />
            <Route path="premios" element={<Rewards />} />
            <Route path="promociones" element={<Promotions />} />
            <Route path="red" element={<Network />} />
            <Route path="billetera" element={<Wallet />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </StoreProvider>
  );
}
