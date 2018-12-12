const gulp = require('gulp');
const ts = require('gulp-typescript');
const md = require('gulp-markdown');
const rename = require('gulp-rename');

gulp.task('compile-ts', () => {
  return gulp.src('src/**/*.ts')
          .pipe(ts('./tsconfig.json'))
          .pipe(gulp.dest("dist/"));
});

gulp.task('compile-md', () => {
  return gulp.src('./README.md')
    .pipe(md())
    .pipe(rename('index.html'))
    .pipe(gulp.dest('dist'));
});

gulp.task('copy-templates', () => {
  return gulp.src('./*.template.json')
    .pipe(gulp.dest('dist'));
});

gulp.task("default", ["compile-md", "compile-ts", "copy-templates"]);