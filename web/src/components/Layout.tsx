import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { Screen } from './Screen';

export function Layout() {
  return (
    <div className="min-h-full">
      <Screen>
        <Outlet />
      </Screen>
      <BottomNav />
    </div>
  );
}
