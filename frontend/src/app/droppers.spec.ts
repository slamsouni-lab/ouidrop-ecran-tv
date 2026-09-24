import { TestBed } from '@angular/core/testing';
import { Droppers } from './droppers';

describe('Droppers', () => {
  let service: Droppers;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Droppers);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
