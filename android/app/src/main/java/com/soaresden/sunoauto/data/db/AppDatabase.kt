package com.soaresden.sunoauto.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [ProjectEntity::class, ClipEntity::class, PlaylistEntity::class, PlaylistClipEntity::class, DownloadEntity::class],
    version = 4,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun projects(): ProjectDao
    abstract fun clips(): ClipDao
    abstract fun playlists(): PlaylistDao
    abstract fun downloads(): DownloadDao

    companion object {
        @Volatile private var instance: AppDatabase? = null

        private val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE clips ADD COLUMN rawJson TEXT")
            }
        }

        fun get(context: Context): AppDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, "suno.db")
                .addMigrations(MIGRATION_3_4)
                .fallbackToDestructiveMigration()
                .build()
                .also { instance = it }
        }
    }
}
