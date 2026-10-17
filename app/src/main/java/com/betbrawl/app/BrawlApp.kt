package com.betbrawl.app

import android.app.Application

class BrawlApp : Application() {
    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    companion object {
        lateinit var instance: BrawlApp
            private set
    }
}
