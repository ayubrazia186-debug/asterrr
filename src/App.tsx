import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { MobileBar, Sidebar } from './components/Shell';
import { Toast } from './components/ui';
import { Home } from './pages/Home';
import { Today } from './pages/Today';
import { Planner } from './pages/Planner';
import { Settings } from './pages/Settings';
import { SubjectLayout } from './pages/subject/SubjectLayout';
import { AiSection, FlashcardsSection, LibrarySection, PlannerSection } from './pages/subject/Sections';

function OldSubjectRedirect() {
  const { id } = useParams();
  return <Navigate to={`/s/${id}/planner`} replace />;
}

export function App() {
  const { pathname } = useLocation();
  // Re-run the entrance animation when you move between top-level pages or subjects, not between a subject's sections.
  const parts = pathname.split('/').filter(Boolean);
  const routeKey = parts[0] === 's' ? `s/${parts[1]}` : parts[0] ?? 'home';
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <Sidebar />
      <MobileBar />
      <main id="main" className="main">
        <div className="route" key={routeKey}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/today" element={<Today />} />
            <Route path="/planner" element={<Planner />} />
            <Route path="/s/:id" element={<SubjectLayout />}>
              <Route index element={<Navigate to="planner" replace />} />
              <Route path="planner" element={<PlannerSection />} />
              <Route path="topicals" element={<LibrarySection section="topicals" />} />
              <Route path="papers" element={<LibrarySection section="papers" />} />
              <Route path="notes" element={<LibrarySection section="notes" />} />
              <Route path="flashcards" element={<FlashcardsSection />} />
              <Route path="ai" element={<AiSection />} />
            </Route>
            <Route path="/subject" element={<Navigate to="/" replace />} />
            <Route path="/subject/:id" element={<OldSubjectRedirect />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
      <Toast />
    </>
  );
}
