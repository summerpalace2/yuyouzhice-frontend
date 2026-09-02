import { createRouter, createWebHistory } from 'vue-router';
import HomePage from '@/pages/HomePage.vue';
import PlanningPage from '@/pages/PlanningPage.vue';
import DetailPage from '@/pages/DetailPage.vue';
import ExplorePage from '@/pages/ExplorePage.vue';
import TripsPage from '@/pages/TripsPage.vue';
import HistoryPage from '@/pages/HistoryPage.vue';
import ProfilePage from '@/pages/ProfilePage.vue';
import AdminPage from '@/pages/AdminPage.vue';

const routes = [
  { path: '/', name: 'home', component: HomePage },
  { path: '/planning', name: 'planning', component: PlanningPage },
  { path: '/detail', name: 'detail', component: DetailPage },
  { path: '/explore', name: 'explore', component: ExplorePage },
  { path: '/trips', name: 'trips', component: TripsPage },
  { path: '/history', name: 'history', component: HistoryPage },
  { path: '/profile', name: 'profile', component: ProfilePage },
  { path: '/admin', name: 'admin', component: AdminPage }
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  }
});
