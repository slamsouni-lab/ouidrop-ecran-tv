import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DropperList } from './dropper-list/dropper-list';

@Component({
  imports: [RouterOutlet, DropperList], 
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('frontend');
}
