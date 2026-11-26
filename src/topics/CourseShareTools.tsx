import React from 'react';
import { Alert } from 'react-native';
import { Button } from '../components/Button';
import { ExamMatchCard } from './ExamMatchCard';
import { AskLaterCard } from './AskLaterCard';
import { saveStudyGuide, shareCourseFile } from './courseFiles';
import type { Course } from './store';

/** What sits under a course's sources: exam match, questions to ask later, and sending or printing the course. */
export function CourseShareTools({ course }: { course: Course }) {
  return (
    <>
      <ExamMatchCard course={course} />
      <AskLaterCard course={course} />
      <Button title="Send this course to another phone" variant="outline" testID="course-share"
        onPress={() => shareCourseFile(course).catch((e) => Alert.alert('Could not save the course', String(e?.message || e)))} />
      <Button title="Save a printable study guide" variant="outline" testID="course-guide"
        onPress={() => saveStudyGuide(course).catch((e) => Alert.alert('Could not make the guide', String(e?.message || e)))} />
    </>
  );
}
