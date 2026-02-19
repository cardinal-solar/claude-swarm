import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { TasksPage } from './pages/TasksPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { ProfilesPage } from './pages/ProfilesPage';
import { HealthPage } from './pages/HealthPage';
import { KnowledgePage } from './pages/KnowledgePage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/app" element={<TasksPage />} />
          <Route path="/app/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/app/knowledge" element={<KnowledgePage />} />
          <Route path="/app/profiles" element={<ProfilesPage />} />
          <Route path="/app/health" element={<HealthPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
