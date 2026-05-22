import React from 'react';
import {createRoot} from 'react-dom/client';
import RobotApp from '../../robot_app2.jsx';
import './index.css';

const el = document.getElementById('robot-root');
if (el) createRoot(el).render(<RobotApp />);
