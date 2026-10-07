export const CameraRoll = {
  save: jest.fn().mockResolvedValue('file:///mock-saved-image.png'),
  getPhotos: jest.fn().mockResolvedValue({
    edges: [],
    page_info: {has_next_page: false, end_cursor: null},
  }),
};
