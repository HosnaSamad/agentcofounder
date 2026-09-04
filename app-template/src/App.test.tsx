import { render, screen, fireEvent } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  test('renders the starter app', () => {
    render(<App />);
    expect(screen.getByText(/AgentCofounder/i)).toBeInTheDocument();
  });

  // This test will be extended by Pi
  test('has a main container', () => {
    render(<App />);
    expect(document.querySelector('main')).toBeInTheDocument();
  });

  // Placeholder for Pi to add more tests
  test.todo('adds a new item');
  test.todo('filters items');
  test.todo('data persists after refresh');
});
