import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DropperList } from './dropper-list';

describe('DropperList', () => {
  let component: DropperList;
  let fixture: ComponentFixture<DropperList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DropperList],
    }).compileComponents();

    fixture = TestBed.createComponent(DropperList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
