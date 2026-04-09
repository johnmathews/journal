<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="layout">
    <nav class="sidebar">
      <div class="sidebar-header">
        <h1>Journal</h1>
      </div>
      <ul class="nav-list">
        <li>
          <RouterLink to="/" class="nav-link">
            <i class="pi pi-list" />
            <span>Entries</span>
          </RouterLink>
        </li>
      </ul>
    </nav>
    <main class="content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 240px;
  background: var(--p-surface-50);
  border-right: 1px solid var(--p-surface-200);
  padding: 1rem;
  flex-shrink: 0;
}

.sidebar-header h1 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 1.5rem 0;
  color: var(--p-surface-900);
}

.nav-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: 6px;
  color: var(--p-surface-700);
  text-decoration: none;
  font-size: 0.875rem;
  transition: background 0.15s;
}

.nav-link:hover {
  background: var(--p-surface-100);
}

.nav-link.router-link-active {
  background: var(--p-primary-50);
  color: var(--p-primary-600);
  font-weight: 500;
}

.content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}

@media (max-width: 768px) {
  .sidebar {
    width: 60px;
    padding: 0.75rem 0.5rem;
  }

  .sidebar-header h1,
  .nav-link span {
    display: none;
  }

  .nav-link {
    justify-content: center;
    padding: 0.75rem;
  }

  .content {
    padding: 1rem;
  }
}
</style>
