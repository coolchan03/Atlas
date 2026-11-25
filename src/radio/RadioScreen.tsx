import React from 'react';
import { MusicStudioScreen } from '../screens/MusicStudioScreen';

/** The AI radio opens on the Radio tab of Music Studio, where the rest of the music is made. */
export const RadioScreen: React.FC = () => <MusicStudioScreen startOn="radio" />;
