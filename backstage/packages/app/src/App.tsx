import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import EntityPage from './components/catalog/EntityPage';

const App = () => {
  return (
    <Router>
      <Switch>
        {/* Other routes */}
        <Route path="/entity/:id" component={EntityPage} />
      </Switch>
    </Router>
  );
};

export default App;