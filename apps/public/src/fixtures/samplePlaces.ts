/**
 * DEVELOPMENT SAMPLE FIXTURES ONLY — NOT LIVE MAP DATA
 *
 * These sample campus locations are strictly for local client UI testing and search
 * demonstration in Ticket S2. They are isolated from production contracts and use
 * distinct synthetic UUIDs to prevent any possibility of collision with production YCT Map data.
 */

export interface SampleCampusPlace {
  id: string;
  name: string;
  category_slug: string;
  category_name: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  landmark_summary: string;
  is_sample_fixture: true;
}

export const SAMPLE_CAMPUS_PLACES: readonly SampleCampusPlace[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Central Library Complex',
    category_slug: 'academic',
    category_name: 'Academic Facilities',
    coordinates: { latitude: 6.5186, longitude: 3.3729 },
    landmark_summary: 'Opposite Academic Planning, Main Quadrangle',
    is_sample_fixture: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Bakassi Lecture Theatre',
    category_slug: 'lecture_hall',
    category_name: 'Lecture Theatres',
    coordinates: { latitude: 6.5182, longitude: 3.3724 },
    landmark_summary: 'Adjacent to Engineering Workshops block',
    is_sample_fixture: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'School of Technology Main Complex',
    category_slug: 'school',
    category_name: 'Academic Schools',
    coordinates: { latitude: 6.5191, longitude: 3.3734 },
    landmark_summary: 'North Academic Axis, near Technology Workshop',
    is_sample_fixture: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    name: 'School of Art, Design & Printing (SADP)',
    category_slug: 'school',
    category_name: 'Academic Schools',
    coordinates: { latitude: 6.5178, longitude: 3.3719 },
    landmark_summary: 'Art gallery and design studio studios wing',
    is_sample_fixture: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    name: 'Campus Medical Centre',
    category_slug: 'health',
    category_name: 'Health & Welfare',
    coordinates: { latitude: 6.5195, longitude: 3.3741 },
    landmark_summary: 'Beside Staff Quarters Gate, East Campus',
    is_sample_fixture: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000006',
    name: 'Student Union Building (SUB)',
    category_slug: 'student_service',
    category_name: 'Student Life',
    coordinates: { latitude: 6.5184, longitude: 3.3715 },
    landmark_summary: 'Student activities center and cafeteria plaza',
    is_sample_fixture: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000007',
    name: 'Sports Complex & Pavilion',
    category_slug: 'recreation',
    category_name: 'Sports & Recreation',
    coordinates: { latitude: 6.5173, longitude: 3.3738 },
    landmark_summary: 'Main playing field and sports arena',
    is_sample_fixture: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000008',
    name: 'Administration Building (Council Chamber)',
    category_slug: 'administrative',
    category_name: 'Administration',
    coordinates: { latitude: 6.5198, longitude: 3.3726 },
    landmark_summary: 'Rectorate and Central Registry offices',
    is_sample_fixture: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000009',
    name: 'Main Campus North Entrance Gate',
    category_slug: 'entrance',
    category_name: 'Gates & Entrances',
    coordinates: { latitude: 6.5203, longitude: 3.3732 },
    landmark_summary: 'Herbert Macaulay Way main vehicular and pedestrian gate',
    is_sample_fixture: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000010',
    name: 'School of Liberal Studies (SLS)',
    category_slug: 'school',
    category_name: 'Academic Schools',
    coordinates: { latitude: 6.5189, longitude: 3.3718 },
    landmark_summary: 'General Studies and Languages lecture halls',
    is_sample_fixture: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000011',
    name: 'Moshood Abiola Hostel (Male Residence)',
    category_slug: 'hostel',
    category_name: 'Residential Halls',
    coordinates: { latitude: 6.5171, longitude: 3.3723 },
    landmark_summary: 'Hostel block A and courtyard',
    is_sample_fixture: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000012',
    name: 'Bursary Department',
    category_slug: 'administrative',
    category_name: 'Administration',
    coordinates: { latitude: 6.5194, longitude: 3.3725 },
    landmark_summary: 'Financial services and payment validation center',
    is_sample_fixture: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000013',
    name: 'Engineering Workshops Complex',
    category_slug: 'workshop',
    category_name: 'Workshops & Labs',
    coordinates: { latitude: 6.518, longitude: 3.3726 },
    landmark_summary: 'Mechanical and Electrical engineering laboratories',
    is_sample_fixture: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000014',
    name: 'Convocation Ground (Open Assembly Field)',
    category_slug: 'open_space',
    category_name: 'Open Grounds',
    coordinates: { latitude: 6.5187, longitude: 3.3739 },
    landmark_summary: 'Large open assembly field used for events and drills',
    is_sample_fixture: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000015',
    name: 'YABATECH Multipurpose Hall',
    category_slug: 'auditorium',
    category_name: 'Auditoriums',
    coordinates: { latitude: 6.5183, longitude: 3.3735 },
    landmark_summary: 'Event auditorium near center lawn',
    is_sample_fixture: true,
  },
] as const;
